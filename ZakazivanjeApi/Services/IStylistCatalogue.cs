using ZakazivanjeApi.Dtos;

namespace ZakazivanjeApi.Services;

/// <summary>Reading and maintaining the people who perform the services.</summary>
public interface IStylistCatalogue
{
    /// <summary>
    /// Who can currently be booked, ordered by name — or everyone the salon has ever had on
    /// the list, the retired included, when <paramref name="includeInactive"/> says so. Who is
    /// allowed to ask for the wider list is settled before this is called.
    /// </summary>
    Task<IReadOnlyList<StylistResponse>> ListAsync(
        bool includeInactive, CancellationToken cancellationToken = default);

    /// <summary>Adds a stylist. They start active.</summary>
    Task<StylistResponse> CreateAsync(
        CreateStylistRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Replaces a stylist's details, and is also how one is retired or brought back. Their
    /// bookings are untouched either way. Throws a <c>DomainException</c> carrying
    /// <c>stylist_not_found</c> for an unknown id.
    /// </summary>
    Task<StylistResponse> UpdateAsync(
        int id, UpdateStylistRequest request, CancellationToken cancellationToken = default);
}
