using ZakazivanjeApi.Dtos;

namespace ZakazivanjeApi.Services;

/// <summary>Reading and maintaining the menu of services the salon sells.</summary>
public interface IServiceCatalogue
{
    /// <summary>The menu: active services only, ordered by name.</summary>
    Task<IReadOnlyList<ServiceResponse>> ListActiveAsync(
        CancellationToken cancellationToken = default);

    /// <summary>
    /// One service, active or not, so a booking made against a withdrawn service still renders.
    /// Throws a <c>DomainException</c> carrying <c>service_not_found</c> for an unknown id.
    /// </summary>
    Task<ServiceResponse> GetAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Adds a service to the menu. It starts active.</summary>
    Task<ServiceResponse> CreateAsync(
        CreateServiceRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Replaces a service's details, and is also what puts a withdrawn one back on the menu.
    /// The bookings already taken against it keep their own snapshot and are untouched
    /// (ADR-0003). Throws <c>service_not_found</c> for an unknown id.
    /// </summary>
    Task<ServiceResponse> UpdateAsync(
        int id, UpdateServiceRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Withdraws a service from the menu, leaving the row and every booking against it exactly
    /// as they are (ADR-0004). Already withdrawn is success, not a conflict: the caller asked
    /// for a state, and it holds. Throws <c>service_not_found</c> for an unknown id.
    /// </summary>
    Task DeactivateAsync(int id, CancellationToken cancellationToken = default);
}
