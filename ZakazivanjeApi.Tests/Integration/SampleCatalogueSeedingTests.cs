using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The salon a freshly cloned repository starts with.
/// </summary>
/// <remarks>
/// Outside <see cref="IntegrationCollection"/>, and deliberately: every test here needs a host
/// whose database has just been created, which is the one condition the shared host cannot
/// offer twice. Each test builds its own, so each gets its own database — the cost is a few
/// seconds and the alternative is asserting about emptiness in a database other tests are
/// filling.
/// </remarks>
public class SampleCatalogueSeedingTests
{
    [Fact]
    public async Task Seeds_a_catalogue_a_reader_can_immediately_book_against()
    {
        await using var factory = new SalonApiFactory { SeedsSampleCatalogue = true };
        var client = factory.CreateClient();

        // Through the API rather than the table, because the claim is about what a reader sees
        // on the menu after following the README — not about rows existing somewhere.
        var menu = await client.GetFromJsonAsync<List<ServiceResponse>>("/api/services");
        var stylists = await client.GetFromJsonAsync<List<StylistResponse>>("/api/stylists");

        Assert.Equal(SampleCatalogue.Services.Count, menu!.Count);
        Assert.Equal(SampleCatalogue.StylistNames.Count, stylists!.Count);

        // All of it bookable: a withdrawn row in seeded data would be a puzzle, not a feature.
        Assert.All(menu, service => Assert.True(service.IsActive));
        Assert.All(stylists, stylist => Assert.True(stylist.IsActive));
    }

    [Fact]
    public async Task Seeds_nothing_when_the_flag_is_off()
    {
        await using var factory = new SalonApiFactory();
        var client = factory.CreateClient();

        var menu = await client.GetFromJsonAsync<List<ServiceResponse>>("/api/services");
        var stylists = await client.GetFromJsonAsync<List<StylistResponse>>("/api/stylists");

        Assert.Empty(menu!);
        Assert.Empty(stylists!);
    }

    [Fact]
    public async Task Leaves_a_catalogue_somebody_is_already_curating_alone()
    {
        await using var factory = new SalonApiFactory { SeedsSampleCatalogue = true };

        // The salon already sells one thing. Seeding again must not add six more beside it, and
        // must not put back anything an admin withdrew — which is why the rule is emptiness
        // rather than name-by-name.
        await factory.WithDbAsync(async db =>
        {
            db.Services.RemoveRange(await db.Services.ToListAsync());
            db.Stylists.RemoveRange(await db.Stylists.ToListAsync());
            db.Services.Add(new Service { Name = "Beard trim", DurationMinutes = 20, Price = 900m });
            return await db.SaveChangesAsync();
        });

        var initializer = await RunSeederAgainAsync(factory);

        Assert.Single(initializer.Services);
        Assert.Equal("Beard trim", initializer.Services[0].Name);
        Assert.Empty(initializer.Stylists);
    }

    [Fact]
    public async Task Seeding_twice_changes_nothing()
    {
        await using var factory = new SalonApiFactory { SeedsSampleCatalogue = true };

        var after = await RunSeederAgainAsync(factory);

        Assert.Equal(SampleCatalogue.Services.Count, after.Services.Count);
        Assert.Equal(SampleCatalogue.StylistNames.Count, after.Stylists.Count);
    }

    /// <summary>
    /// Runs the seeder a second time against the same database — what starting the application
    /// again does — and reads back what the catalogue holds afterwards.
    /// </summary>
    private static async Task<(List<Service> Services, List<Stylist> Stylists)>
        RunSeederAgainAsync(SalonApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();

        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .SeedSampleCatalogueAsync();

        var db = scope.ServiceProvider.GetRequiredService<SalonDbContext>();

        return (await db.Services.ToListAsync(), await db.Stylists.ToListAsync());
    }
}
