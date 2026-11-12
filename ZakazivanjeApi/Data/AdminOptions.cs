namespace ZakazivanjeApi.Data;

/// <summary>
/// The first administrator, seeded at database initialisation. There is no endpoint that can
/// create one: registration always produces a client, and a role field in that payload would
/// let anyone make themselves an admin (ADR-0006).
/// </summary>
public class AdminOptions
{
    public const string SectionName = "Admin";

    /// <summary>From user-secrets locally, environment variables elsewhere. Never a tracked file.</summary>
    public string? Email { get; set; }

    /// <summary>The plaintext password, hashed on the way in and never stored as given.</summary>
    public string? Password { get; set; }

    public string Name { get; set; } = "Salon administrator";
}
