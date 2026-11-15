using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Time.Testing;
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

    /// <summary>
    /// The one origin the tests configure as allowed. Deliberately not the Vite origin the
    /// shipped development configuration names, so that a passing CORS test is evidence the
    /// policy reads its origins from configuration rather than evidence of a literal.
    /// </summary>
    public const string AllowedOrigin = "https://frontend.salon.test";

    /// <summary>
    /// The server the suite builds its database on, when the default is not available.
    /// </summary>
    /// <remarks>
    /// Set it to a connection string naming a server and how to authenticate against it — the
    /// catalogue in it is ignored, because this class names its own. CI is why it exists: a
    /// Linux runner has no LocalDB, and a SQL Server in a container is reached by host and
    /// password rather than by instance name.
    /// </remarks>
    public const string ServerOverrideVariable = "SALON_TEST_SQLSERVER";

    /// <summary>
    /// LocalDB, which the README names as the development prerequisite and which every
    /// developer running this suite already has.
    /// </summary>
    private const string DefaultServer =
        @"Server=(localdb)\mssqllocaldb;Trusted_Connection=True;TrustServerCertificate=True";

    /// <summary>
    /// The connection string for this run's own database.
    /// </summary>
    /// <remarks>
    /// Built with <see cref="SqlConnectionStringBuilder"/> rather than by concatenation, so an
    /// override may name a server any way SQL Server accepts — a host and port, a password, an
    /// instance — without this class having to know which keywords it used. Only the catalogue
    /// is ours to set, and setting it is the point: the database is unique to the run, created
    /// by the application's own migrations and dropped afterwards.
    /// </remarks>
    private string ConnectionString =>
        new SqlConnectionStringBuilder(
            Environment.GetEnvironmentVariable(ServerOverrideVariable) is { Length: > 0 } server
                ? server
                : DefaultServer)
        {
            InitialCatalog = _databaseName,
        }.ConnectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development, so the application migrates its own database on startup exactly as it
        // does locally. Anything else would mean migrating around the application rather than
        // through it, and the startup path would go untested.
        builder.UseEnvironment(Environments.Development);

        builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SalonDb"] = ConnectionString,
                ["Jwt:Key"] = "integration-test-signing-key-not-a-real-secret",
                ["Jwt:Issuer"] = "ZakazivanjeApi.Tests",
                ["Jwt:Audience"] = "ZakazivanjeApi.Tests",
                ["Jwt:LifetimeMinutes"] = "60",
                ["Admin:Email"] = AdminEmail,
                ["Admin:Password"] = AdminPassword,
                ["Cors:AllowedOrigins:0"] = AllowedOrigin,
            }));

        // The probe routes, added to the running application rather than built into it, so the
        // authentication wiring can be exercised without the API carrying endpoints for tests.
        builder.ConfigureTestServices(services =>
            services.AddControllers().AddApplicationPart(typeof(ProbeController).Assembly));
    }

    /// <summary>
    /// A client of this same application and this same database, with the clock the booking
    /// rules read pinned to <paramref name="now"/>. It is a host of its own, so the shared one
    /// every other test uses keeps the real clock — which matters, because a frozen clock in a
    /// future year would make the tokens this suite mints fail validation.
    /// </summary>
    /// <param name="now">
    /// Salon wall-clock. The fake provider's local zone is UTC, so this is exactly what the
    /// rules will read as "now" (ADR-0001).
    /// </param>
    public HttpClient CreateClientAt(DateTime now) =>
        WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
                services.AddSingleton<TimeProvider>(
                    new FakeTimeProvider(new DateTimeOffset(now, TimeSpan.Zero)))))
            .CreateClient();

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
