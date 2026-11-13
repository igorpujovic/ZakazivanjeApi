using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Loads what a booking decision needs, asks <see cref="BookingRules"/> and
/// <see cref="BookingTransitions"/>, and writes the answer down. No time arithmetic of its own:
/// every "is this allowed" question is answered in <c>Domain/</c> (ADR-0007).
/// </summary>
public class BookingService(SalonDbContext db, BookingRules rules) : IBookingService
{
    /// <summary>
    /// How many times a creation may be tried before the caller hears about it. A second
    /// attempt is only ever made after a deadlock, which here means another request held the
    /// same stylist's time; the retry then sees whatever that one committed and answers
    /// properly, rather than reporting a database fault for an ordinary collision.
    /// </summary>
    private const int CreateAttempts = 3;

    public async Task<BookingResponse> CreateAsync(
        int clientId,
        CreateBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        // Not null by the time an action runs: all three are Required, so a request missing one
        // was answered with a 400 long before this.
        var stylistId = request.StylistId!.Value;
        var serviceId = request.ServiceId!.Value;

        var client = await db.Users
            .AsNoTracking()
            .Where(user => user.Id == clientId)
            .Select(user => new { user.Name })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw DomainException.Unauthorized(
                "invalid_token", "The token names a user who no longer exists.");

        var stylist = await db.Stylists
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == stylistId, cancellationToken)
            ?? throw DomainException.NotFound(
                "stylist_not_found", $"No stylist has id {stylistId}.");

        var service = await db.Services
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == serviceId, cancellationToken)
            ?? throw DomainException.NotFound(
                "service_not_found", $"No service has id {serviceId}.");

        // All three are read outside the transaction, which then covers the overlap query and
        // the insert and nothing else. None of them is part of the invariant being protected.
        var proposed = new ProposedBooking(
            request.Start!.Value, service.DurationMinutes, stylist.IsActive, service.IsActive);

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await SaveAsync(
                    clientId, client.Name, stylist, service, proposed, cancellationToken);
            }
            catch (Exception exception) when (IsDeadlockVictim(exception))
            {
                // Chosen as the victim of a deadlock with another booking for this stylist.
                // Nothing was written, so trying again is safe, and the next attempt reads what
                // the winner committed and refuses or accepts on the merits.
                db.ChangeTracker.Clear();

                if (attempt == CreateAttempts)
                {
                    // Still contended after every attempt. That is a conflict over this
                    // stylist's time and is answered as one, with the database's own
                    // complaint kept for the log: a race is not a server fault, and a caller
                    // who is told to try again can act on it where a bare 500 tells them
                    // nothing.
                    throw DomainException.Conflict(
                        "booking_contended",
                        "That stylist's schedule is being changed by someone else right now. "
                            + "Please try again.",
                        exception);
                }
            }
        }
    }

    /// <summary>
    /// One attempt at the thing the whole serializable decision exists for: look at what
    /// already occupies the stylist, then insert, with nothing able to slip in between
    /// (ADR-0005).
    /// </summary>
    private async Task<BookingResponse> SaveAsync(
        int clientId,
        string clientName,
        Stylist stylist,
        Service service,
        ProposedBooking proposed,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);

        Refuse(rules.Check(
            proposed,
            await db.Bookings.BusyAsync(stylist.Id, proposed.Interval, cancellationToken)));

        var booking = new Booking
        {
            UserId = clientId,
            StylistId = stylist.Id,
            ServiceId = service.Id,
            Start = proposed.Interval.Start,

            // The snapshot: taken from the service as it is now, and never recalculated from it
            // again (ADR-0003).
            End = proposed.Interval.End,
            PriceAtBooking = service.Price,
            ServiceNameAtBooking = service.Name,
            Status = BookingStatus.Scheduled,
        };

        db.Bookings.Add(booking);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (IsDuplicateKey(exception))
        {
            // The filtered unique index on (StylistId, Start), the second line of defence under
            // the transaction. Reached only for an identical start; a partial overlap is the
            // transaction's to catch. Either way it is a collision, not a server fault.
            db.ChangeTracker.Clear();

            throw DomainException.Conflict(
                "booking_overlap",
                "That stylist already has a booking at that time.",
                exception);
        }

        await transaction.CommitAsync(cancellationToken);

        return new BookingResponse(
            booking.Id,
            booking.Start,
            booking.End,
            booking.Status.ToString(),
            stylist.Id,
            stylist.Name,
            service.Id,
            booking.ServiceNameAtBooking,
            booking.PriceAtBooking,
            clientId,
            clientName);
    }

    public async Task<IReadOnlyList<BookingResponse>> ListForClientAsync(
        int clientId, CancellationToken cancellationToken = default) =>
        [.. (await Rows(db.Bookings.Where(booking => booking.UserId == clientId))
            .ToListAsync(cancellationToken))
            .Select(ToResponse)];

    public async Task<PagedResponse<BookingResponse>> ListAsync(
        BookingsQuery query, CancellationToken cancellationToken = default)
    {
        var matching = db.Bookings.AsQueryable();

        if (query.Date is { } date)
        {
            // By the day a booking starts on, with the day itself defined where every other
            // span of time is (ADR-0007). One that ran past midnight would belong to the day it
            // began, which is the day the salon put it in the book — and cannot happen anyway
            // while working hours stay inside a single day.
            var day = TimeInterval.Day(date);

            matching = matching.Where(
                booking => booking.Start >= day.Start && booking.Start < day.End);
        }

        if (query.StylistId is { } stylistId)
        {
            matching = matching.Where(booking => booking.StylistId == stylistId);
        }

        // Counted before the page is cut, because the caller is told how much there is in all.
        var totalCount = await matching.CountAsync(cancellationToken);
        var pageSize = query.EffectivePageSize;

        var rows = await Rows(matching)
            .Skip((query.Page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return PagedResponse<BookingResponse>.Of(
            [.. rows.Select(ToResponse)], query.Page, pageSize, totalCount);
    }

    public async Task<BookingResponse> CancelAsync(
        int bookingId, Caller caller, CancellationToken cancellationToken = default)
    {
        var booking = await VisibleAsync(bookingId, caller.ClientScope, cancellationToken);

        // What the statuses allow comes first: a booking already called off is already called
        // off, whatever the hour, and saying so is more use than a word about the deadline.
        Refuse(BookingTransitions.To(booking.Status, BookingStatus.Cancelled));
        Refuse(rules.CheckCancellation(booking.Start, caller.IsAdmin));

        booking.Status = BookingStatus.Cancelled;

        await db.SaveChangesAsync(cancellationToken);

        return await ReadAsync(bookingId, cancellationToken);
    }

    public async Task<BookingResponse> CompleteAsync(
        int bookingId, CancellationToken cancellationToken = default)
    {
        // Only an admin reaches this route, and the salon's reach is every client's bookings.
        var booking = await VisibleAsync(bookingId, clientId: null, cancellationToken);

        Refuse(BookingTransitions.To(booking.Status, BookingStatus.Completed));
        Refuse(rules.CheckCompletion(booking.Start));

        booking.Status = BookingStatus.Completed;

        await db.SaveChangesAsync(cancellationToken);

        return await ReadAsync(bookingId, cancellationToken);
    }

    /// <summary>
    /// The booking as this caller is entitled to see it, where <paramref name="clientId"/> is
    /// the one client whose bookings they may reach, or <c>null</c> for the salon's reach over
    /// everybody's. Someone else's booking is missing rather than forbidden, because a
    /// <c>403</c> would confirm that a booking with that id exists.
    /// </summary>
    private async Task<Booking> VisibleAsync(
        int bookingId, int? clientId, CancellationToken cancellationToken)
    {
        var visible = db.Bookings.Where(booking => booking.Id == bookingId);

        if (clientId is { } client)
        {
            visible = visible.Where(booking => booking.UserId == client);
        }

        return await visible.SingleOrDefaultAsync(cancellationToken)
            ?? throw DomainException.NotFound(
                "booking_not_found", $"No booking you can see has id {bookingId}.");
    }

    /// <summary>Turns a refused rule into the conflict the caller will be answered with.</summary>
    private static void Refuse(BookingRuleResult result)
    {
        if (result.Failure is { } failure)
        {
            throw DomainException.Conflict(failure.Code, failure.Message);
        }
    }

    /// <summary>
    /// One booking, read back the way every other response is built, so a booking that has just
    /// changed is described exactly as the lists describe it.
    /// </summary>
    private async Task<BookingResponse> ReadAsync(
        int bookingId, CancellationToken cancellationToken) =>
        ToResponse(
            await Rows(db.Bookings.Where(booking => booking.Id == bookingId))
                .SingleAsync(cancellationToken));

    /// <summary>
    /// The columns a response is built from, read in one query rather than by loading entities
    /// and walking their navigations — which would pull whole user rows, password hash and
    /// all, to put a name in a response.
    /// </summary>
    private static IQueryable<BookingRow> Rows(IQueryable<Booking> bookings) =>
        bookings
            .AsNoTracking()

            // Ordered here rather than afterwards: once the row has been built by a
            // constructor, SQL Server has nothing left to sort by. Soonest first, which is the
            // order these will be lived in, with the id breaking a tie so that two bookings
            // sharing a start keep a stable order between requests — and, once this list is
            // paged, so that neither of them is duplicated onto two pages or skipped by both.
            .OrderBy(booking => booking.Start)
            .ThenBy(booking => booking.Id)
            .Select(booking => new BookingRow(
                booking.Id,
                booking.Start,
                booking.End,
                booking.Status,
                booking.StylistId,
                booking.Stylist.Name,
                booking.ServiceId,
                booking.ServiceNameAtBooking,
                booking.PriceAtBooking,
                booking.UserId,
                booking.User.Name));

    /// <summary>
    /// The status becomes a name here rather than in the query, because translating an enum to
    /// its name is SQL the database should not be asked to write.
    /// </summary>
    private static BookingResponse ToResponse(BookingRow row) =>
        new(
            row.Id,
            row.Start,
            row.End,
            row.Status.ToString(),
            row.StylistId,
            row.StylistName,
            row.ServiceId,
            row.ServiceName,
            row.Price,
            row.ClientId,
            row.ClientName);

    /// <summary>SQL Server's unique-violation numbers: 2627 for a constraint, 2601 for an index.</summary>
    private static bool IsDuplicateKey(Exception exception) =>
        ReportsSqlError(exception, 2601, 2627);

    /// <summary>Whether SQL Server picked this transaction as a deadlock victim (error 1205).</summary>
    private static bool IsDeadlockVictim(Exception exception) => ReportsSqlError(exception, 1205);

    /// <summary>
    /// Whether SQL Server raised one of these errors anywhere in the chain. The whole chain,
    /// because how deeply it is buried depends on where it happened: a query reports it bare, a
    /// save wraps it in a <see cref="DbUpdateException"/>, and EF Core wraps that again in a
    /// transient-failure complaint for the errors it considers worth retrying — the deadlock
    /// among them. Matching on the outermost type alone silently misses the one case this
    /// method exists for.
    /// </summary>
    private static bool ReportsSqlError(Exception exception, params int[] numbers)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is SqlException sql && numbers.Contains(sql.Number))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// One booking as the database hands it over, before the status is turned into a name.
    /// Private, because nothing outside this class has any business holding one.
    /// </summary>
    private sealed record BookingRow(
        int Id,
        DateTime Start,
        DateTime End,
        BookingStatus Status,
        int StylistId,
        string StylistName,
        int ServiceId,
        string ServiceName,
        decimal Price,
        int ClientId,
        string ClientName);
}
