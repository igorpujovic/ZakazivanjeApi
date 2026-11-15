using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Data;

/// <summary>Brings an empty or outdated database up to date and makes sure an admin exists.</summary>
public class DatabaseInitializer(
    SalonDbContext db,
    IOptions<AdminOptions> adminOptions,
    IOptions<SampleCatalogueOptions> sampleCatalogue,
    IPasswordHasher<User> passwordHasher,
    ILogger<DatabaseInitializer> logger)
{
    /// <summary>Applies pending migrations. Development only; elsewhere run <c>dotnet ef database update</c>.</summary>
    public Task MigrateAsync(CancellationToken cancellationToken = default) =>
        db.Database.MigrateAsync(cancellationToken);

    /// <summary>
    /// Creates the configured administrator if no user holds that email. Idempotent: an existing
    /// user with that email is left exactly as it is, password included.
    /// </summary>
    public async Task SeedAdminAsync(CancellationToken cancellationToken = default)
    {
        var admin = adminOptions.Value;

        if (string.IsNullOrWhiteSpace(admin.Email) || string.IsNullOrWhiteSpace(admin.Password))
        {
            logger.LogWarning(
                "No administrator was seeded: {Section}:Email and {Section}:Password are not "
                    + "configured. Set them with dotnet user-secrets locally, or environment "
                    + "variables elsewhere.",
                AdminOptions.SectionName,
                AdminOptions.SectionName);
            return;
        }

        if (await db.Users.AnyAsync(u => u.Email == admin.Email, cancellationToken))
        {
            logger.LogInformation(
                "Administrator {Email} already exists and was left untouched.", admin.Email);
            return;
        }

        var user = new User
        {
            Name = admin.Name,
            Email = admin.Email,
            Role = UserRole.Admin,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, admin.Password);

        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Seeded administrator {Email}.", admin.Email);
        }
        catch (DbUpdateException)
        {
            db.Entry(user).State = EntityState.Detached;

            // Two instances starting at once: the unique index on Email decided which won, and
            // losing that race is the same outcome as finding the row above. Anything else —
            // a save that failed for its own reasons — must not be mistaken for success.
            if (!await db.Users.AnyAsync(u => u.Email == admin.Email, cancellationToken))
            {
                throw;
            }

            logger.LogInformation(
                "Administrator {Email} was seeded by another instance.", admin.Email);
        }
    }

    /// <summary>
    /// Puts <see cref="SampleCatalogue"/> into a catalogue that has nothing in it yet, when
    /// <c>SampleCatalogue:Enabled</c> says to.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Idempotent by emptiness rather than by name: a single existing service or stylist means
    /// somebody is curating this catalogue, and the answer is then to leave it alone entirely.
    /// Topping it up row by row would put "Blow Dry" back for an admin who had withdrawn it,
    /// which is the application overruling a decision a person made.
    /// </para>
    /// <para>
    /// Checked before the flag is read, so the log line distinguishes the two reasons for doing
    /// nothing. "Seeding is off" and "there is already a salon here" are different facts, and a
    /// reader wondering why their menu is empty needs to know which one they are looking at.
    /// </para>
    /// </remarks>
    public async Task SeedSampleCatalogueAsync(CancellationToken cancellationToken = default)
    {
        if (!sampleCatalogue.Value.Enabled)
        {
            logger.LogInformation(
                "No sample catalogue was seeded: {Section}:Enabled is not set.",
                SampleCatalogueOptions.SectionName);
            return;
        }

        if (await db.Services.AnyAsync(cancellationToken)
            || await db.Stylists.AnyAsync(cancellationToken))
        {
            logger.LogInformation(
                "The catalogue already has rows in it and was left untouched.");
            return;
        }

        db.Services.AddRange(SampleCatalogue.NewServices());
        db.Stylists.AddRange(SampleCatalogue.NewStylists());

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Seeded a sample catalogue: {ServiceCount} services and {StylistCount} stylists.",
            SampleCatalogue.Services.Count,
            SampleCatalogue.StylistNames.Count);
    }
}
