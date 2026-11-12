using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>The menu of services, over the specification's <c>Service</c> table.</summary>
public class ServiceCatalogue(SalonDbContext db) : IServiceCatalogue
{
    public async Task<IReadOnlyList<ServiceResponse>> ListActiveAsync(
        CancellationToken cancellationToken = default) =>
        await db.Services
            .AsNoTracking()
            .Where(service => service.IsActive)

            // By name, because this is a menu someone reads. Id breaks the tie, so two services
            // sharing a name keep a stable order between requests rather than swapping.
            .OrderBy(service => service.Name)
            .ThenBy(service => service.Id)
            .Select(service => new ServiceResponse(
                service.Id,
                service.Name,
                service.DurationMinutes,
                service.Price,
                service.IsActive))
            .ToListAsync(cancellationToken);

    public async Task<ServiceResponse> GetAsync(
        int id, CancellationToken cancellationToken = default)
    {
        var service = await db.Services
            .AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == id, cancellationToken);

        return ToResponse(service ?? throw NotFound(id));
    }

    public async Task<ServiceResponse> CreateAsync(
        CreateServiceRequest request, CancellationToken cancellationToken = default)
    {
        var service = new Service
        {
            Name = request.Name,
            DurationMinutes = request.DurationMinutes,
            Price = request.Price,
        };

        db.Services.Add(service);

        await db.SaveChangesAsync(cancellationToken);

        return ToResponse(service);
    }

    public async Task<ServiceResponse> UpdateAsync(
        int id, UpdateServiceRequest request, CancellationToken cancellationToken = default)
    {
        var service = await db.Services.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw NotFound(id);

        service.Name = request.Name;
        service.DurationMinutes = request.DurationMinutes;

        // Not null by the time an action runs: the flag is Required, so a request without one
        // was answered with a 400 long before this.
        service.IsActive = request.IsActive!.Value;
        service.Price = request.Price;

        await db.SaveChangesAsync(cancellationToken);

        return ToResponse(service);
    }

    public async Task DeactivateAsync(int id, CancellationToken cancellationToken = default)
    {
        var service = await db.Services.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw NotFound(id);

        // Nothing here reads Bookings, which is the point: withdrawing a service from the menu
        // leaves the bookings already taken against it Scheduled (ADR-0004). A service that is
        // already inactive produces no change, and so no UPDATE.
        service.IsActive = false;

        await db.SaveChangesAsync(cancellationToken);
    }

    private static ServiceResponse ToResponse(Service service) =>
        new(service.Id, service.Name, service.DurationMinutes, service.Price, service.IsActive);

    private static DomainException NotFound(int id) =>
        DomainException.NotFound("service_not_found", $"No service has id {id}.");
}
