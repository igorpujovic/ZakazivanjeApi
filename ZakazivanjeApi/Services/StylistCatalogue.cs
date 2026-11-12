using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>The salon's stylists, over the specification's <c>Stylist</c> table.</summary>
public class StylistCatalogue(SalonDbContext db) : IStylistCatalogue
{
    public async Task<IReadOnlyList<StylistResponse>> ListActiveAsync(
        CancellationToken cancellationToken = default) =>
        await db.Stylists
            .AsNoTracking()
            .Where(stylist => stylist.IsActive)

            // Id breaks the tie, so two stylists sharing a name keep a stable order between
            // requests rather than swapping.
            .OrderBy(stylist => stylist.Name)
            .ThenBy(stylist => stylist.Id)
            .Select(stylist => new StylistResponse(stylist.Id, stylist.Name, stylist.IsActive))
            .ToListAsync(cancellationToken);

    public async Task<StylistResponse> CreateAsync(
        CreateStylistRequest request, CancellationToken cancellationToken = default)
    {
        var stylist = new Stylist { Name = request.Name };

        db.Stylists.Add(stylist);

        await db.SaveChangesAsync(cancellationToken);

        return ToResponse(stylist);
    }

    public async Task<StylistResponse> UpdateAsync(
        int id, UpdateStylistRequest request, CancellationToken cancellationToken = default)
    {
        var stylist = await db.Stylists.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw NotFound(id);

        stylist.Name = request.Name;

        // Nothing here reads Bookings: retiring a stylist takes them off the list for new
        // bookings and leaves the ones already taken for the salon to resolve. Not null by the
        // time an action runs, because the flag is Required.
        stylist.IsActive = request.IsActive!.Value;

        await db.SaveChangesAsync(cancellationToken);

        return ToResponse(stylist);
    }

    private static StylistResponse ToResponse(Stylist stylist) =>
        new(stylist.Id, stylist.Name, stylist.IsActive);

    private static DomainException NotFound(int id) =>
        DomainException.NotFound("stylist_not_found", $"No stylist has id {id}.");
}
