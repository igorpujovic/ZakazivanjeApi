using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Loads the day's facts and hands them to <see cref="BookingRules"/>. It decides no slots of
/// its own: which starts are free is settled by the very rules <c>POST /api/bookings</c> will
/// apply, which is what stops the two endpoints disagreeing (ADR-0007).
/// </summary>
public class SlotFinder(SalonDbContext db, BookingRules rules) : ISlotFinder
{
    public async Task<AvailableSlotsResponse> FindAsync(
        int stylistId, AvailableSlotsQuery query, CancellationToken cancellationToken = default)
    {
        // Neither is null by the time a request gets this far: both are Required on the query,
        // so a missing one is a 400 the action never runs for.
        var date = query.Date!.Value;
        var serviceId = query.ServiceId!.Value;

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

        // Both exist, and neither can be booked, so there is nothing to offer and nothing to
        // complain about. Asking the database for the day's bookings would only be work whose
        // answer is already known.
        if (!stylist.IsActive || !service.IsActive)
        {
            return new AvailableSlotsResponse(date, service.DurationMinutes, []);
        }

        return new AvailableSlotsResponse(
            date,
            service.DurationMinutes,
            rules.AvailableSlots(
                date,
                service.DurationMinutes,
                await BusyAsync(stylistId, date, cancellationToken)));
    }

    /// <summary>
    /// What already occupies the stylist on that day. Cancelled bookings are left out by naming
    /// the two statuses that count rather than by excluding the one that does not, so a status
    /// added later has to be considered rather than quietly occupying time.
    /// </summary>
    private async Task<IReadOnlyCollection<TimeInterval>> BusyAsync(
        int stylistId, DateOnly date, CancellationToken cancellationToken)
    {
        var dayStart = date.ToDateTime(TimeOnly.MinValue);
        var dayEnd = dayStart.AddDays(1);

        var bookings = await db.Bookings
            .AsNoTracking()
            .Where(booking =>
                booking.StylistId == stylistId
                && (booking.Status == BookingStatus.Scheduled
                    || booking.Status == BookingStatus.Completed)

                // The same half-open overlap the rules use, against the day itself: a booking
                // is loaded because it shares time with the day, not because it starts in it.
                && booking.Start < dayEnd
                && booking.End > dayStart)
            .Select(booking => new { booking.Start, booking.End })
            .ToListAsync(cancellationToken);

        return [.. bookings.Select(booking => new TimeInterval(booking.Start, booking.End))];
    }
}
