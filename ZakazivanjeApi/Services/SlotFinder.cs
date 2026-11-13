using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;

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
                await db.Bookings.BusyAsync(
                    stylistId, TimeInterval.Day(date), cancellationToken)));
    }
}
