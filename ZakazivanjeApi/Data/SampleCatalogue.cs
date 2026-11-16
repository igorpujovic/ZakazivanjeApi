using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Data;

/// <summary>
/// The salon a freshly cloned repository starts with: six services and four stylists.
/// </summary>
/// <remarks>
/// <para>
/// These are the rows the screenshots in the README were taken against, so a reader running the
/// application sees the thing they were just looking at rather than a different salon.
/// </para>
/// <para>
/// Durations and prices are spread on purpose. A twenty-minute beard trim and a two-hour
/// "works" behave visibly differently on the slot grid — the long one is refused far more
/// often as a day fills, which is the rule about a service having to fit inside working hours
/// doing its job. A catalogue of six identical haircuts would hide that.
/// </para>
/// <para>
/// No bookings. A booking belongs to a client, and inventing clients means inventing accounts
/// with passwords — which is the one thing this file must not do, since a tracked file with a
/// credential in it is what ADR-0006 and the README are emphatic about. Make a booking through
/// the UI; that is the part worth seeing anyway.
/// </para>
/// <para>
/// The rows are held as plain descriptions and turned into entities on each call, rather than
/// as entity instances held in a static field. An entity that has been saved carries the
/// <c>Id</c> the database gave it, so a static one is a different object the second time it is
/// used — and EF Core answers an insert of a row that already has an identity with
/// <c>IDENTITY_INSERT is set to OFF</c>. Caught by <c>SampleCatalogueSeedingTests</c>, which
/// seeds twice precisely because starting the application twice is the ordinary case.
/// </para>
/// </remarks>
public static class SampleCatalogue
{
    /// <summary>A service as this file describes one: no identity, nothing database-shaped.</summary>
    public sealed record ServiceRow(string Name, int DurationMinutes, decimal Price);

    /// <summary>Prices in RSD, durations in minutes, as <c>Service</c> means them.</summary>
    public static IReadOnlyList<ServiceRow> Services { get; } =
    [
        new("Haircut", 30, 1200m),
        new("Skin fade", 45, 1600m),
        new("Beard trim", 20, 900m),
        new("Hot towel shave", 45, 1800m),
        new("Cut and beard", 60, 2300m),
        new("The works", 120, 3500m),
    ];

    /// <summary>Four, so that <b>No preference</b> on the booking page has something to merge.</summary>
    public static IReadOnlyList<string> StylistNames { get; } = ["Nina", "Marko", "Jelena", "Stefan"];

    /// <summary>Fresh entities, unsaved and without identities. A new set on every call.</summary>
    public static IEnumerable<Service> NewServices() =>
        Services.Select(row => new Service
        {
            Name = row.Name,
            DurationMinutes = row.DurationMinutes,
            Price = row.Price,
        });

    /// <inheritdoc cref="NewServices"/>
    public static IEnumerable<Stylist> NewStylists() =>
        StylistNames.Select(name => new Stylist { Name = name });
}
