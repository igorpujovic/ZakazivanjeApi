using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Data;

/// <summary>
/// The queries the booking rules are fed from. One definition of "occupied", used by slot
/// generation and by booking creation alike, because two copies of it are two chances to
/// disagree about which statuses hold a stylist's time.
/// </summary>
public static class BookingQueries
{
    /// <summary>
    /// What already occupies <paramref name="stylistId"/> during <paramref name="span"/> — the
    /// proposed booking's own interval when one is being made, the whole day when slots are
    /// being offered.
    /// </summary>
    /// <remarks>
    /// Cancelled bookings are left out by naming the two statuses that count rather than by
    /// excluding the one that does not, so a status added later has to be considered rather
    /// than quietly occupying time. Run inside a serializable transaction this is also what
    /// takes the lock that makes the overlap rule hold under concurrency (ADR-0005).
    /// </remarks>
    public static async Task<IReadOnlyCollection<TimeInterval>> BusyAsync(
        this DbSet<Booking> bookings,
        int stylistId,
        TimeInterval span,
        CancellationToken cancellationToken = default)
    {
        var busy = await bookings
            .AsNoTracking()
            .Where(booking =>
                booking.StylistId == stylistId
                && (booking.Status == BookingStatus.Scheduled
                    || booking.Status == BookingStatus.Completed)

                // The same half-open test the rules apply, against the span asked about: a
                // booking is loaded because it shares time with it, not because it starts in it.
                && booking.Start < span.End
                && booking.End > span.Start)
            .Select(booking => new { booking.Start, booking.End })
            .ToListAsync(cancellationToken);

        return [.. busy.Select(booking => new TimeInterval(booking.Start, booking.End))];
    }
}
