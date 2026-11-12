using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ZakazivanjeApi.Data;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The real application, started against a database of its own. Nothing is substituted: the
/// pipeline, the migrations and the admin seeding are the ones that ship, because the things
/// worth proving here — the unique index returning a conflict, a case-insensitive email, the
/// seeded admin's role — only exist once SQL Server and the real startup path are involved.
/// </summary>
/// <remarks>
/// A uniquely-named database per run, migrated at start and dropped at the end, as the
/// specification requires. Not a transaction rolled back per test: that would deadlock the
/// serializable overlap test arriving in a later issue.
/// </remarks>
public sealed class SalonApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _databaseName = $"SalonBooking_Tests_{Guid.NewGuid():N}";

    /// <summary>The credentials the seeder is given, so tests can log the admin in.</summary>
    public const string AdminEmail = "admin@salon.test";

    public const string AdminPassword = "Seeded-Admin-Pass-1";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development, so the application migrates its own database on startup exactly as it
        // does locally. Anything else would mean migrating around the application rather than
        // through it, and the startup path would go untested.
        builder.UseEnvironment(Environments.Development);

        builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SalonDb"] =
                    $@"Server=(localdb)\mssqllocaldb;Database={_databaseName};"
                    + "Trusted_Connection=True;TrustServerCertificate=True",
                ["Jwt:Key"] = "integration-test-signing-key-not-a-real-secret",
                ["Jwt:Issuer"] = "ZakazivanjeApi.Tests",
                ["Jwt:Audience"] = "ZakazivanjeApi.Tests",
                ["Jwt:LifetimeMinutes"] = "60",
                ["Admin:Email"] = AdminEmail,
                ["Admin:Password"] = AdminPassword,
            }));

        // The probe routes, added to the running application rather than built into it, so the
        // authentication wiring can be exercised without the API carrying endpoints for tests.
        builder.ConfigureTestServices(services =>
            services.AddControllers().AddApplicationPart(typeof(ProbeController).Assembly));
    }

    /// <summary>
    /// Runs <paramref name="work"/> against the application's own database, for the few facts
    /// no endpoint exposes yet. Used to set up a booking before the booking endpoints exist,
    /// and to read one back afterwards.
    /// </summary>
    public async Task<T> WithDbAsync<T>(Func<SalonDbContext, Task<T>> work)
    {
        await using var scope = Services.CreateAsyncScope();

        return await work(scope.ServiceProvider.GetRequiredService<SalonDbContext>());
    }

    /// <summary>Starts the host, which is what creates and migrates the database.</summary>
    public Task InitializeAsync()
    {
        _ = Services;
        return Task.CompletedTask;
    }

    public new async Task DisposeAsync()
    {
        await using (var scope = Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SalonDbContext>();
            await db.Database.EnsureDeletedAsync();
        }

        await base.DisposeAsync();
    }
}

/// <summary>
/// One host and one database for every integration test, rather than one per class. Tests
/// therefore pick their own email addresses instead of assuming an empty table.
/// </summary>
[CollectionDefinition(Name)]
public class IntegrationCollection : ICollectionFixture<SalonApiFactory>
{
    public const string Name = "Salon API";
}
