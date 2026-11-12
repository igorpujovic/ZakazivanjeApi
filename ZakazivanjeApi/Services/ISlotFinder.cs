using ZakazivanjeApi.Dtos;

namespace ZakazivanjeApi.Services;

/// <summary>Answering "when can I come in?" for one stylist, service and day.</summary>
public interface ISlotFinder
{
    /// <summary>
    /// The starts that could still be booked. Empty rather than an error whenever nothing is
    /// bookable — a closed weekday, a retired stylist, a withdrawn service, a full day — because
    /// having no free time is not the same as not existing. Throws a <c>DomainException</c>
    /// carrying <c>stylist_not_found</c> or <c>service_not_found</c> when something really does
    /// not exist.
    /// </summary>
    Task<AvailableSlotsResponse> FindAsync(
        int stylistId, AvailableSlotsQuery query, CancellationToken cancellationToken = default);
}
