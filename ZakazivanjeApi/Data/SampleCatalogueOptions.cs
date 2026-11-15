namespace ZakazivanjeApi.Data;

/// <summary>
/// Whether to put a few services and stylists in an empty database, so that a freshly cloned
/// repository has a salon in it rather than an empty one.
/// </summary>
/// <remarks>
/// <para>
/// Off unless configured. The <b>catalogue</b> is what an admin curates, and inventing rows in
/// somebody's real database would be the application deciding what the salon sells. It is on in
/// <c>appsettings.Development.json</c> only, where the database is a developer's own.
/// </para>
/// <para>
/// This exists because seeding an administrator is not enough to see anything: with no services
/// and no stylists, the menu is empty, no day has a slot on it, and the first screen a reader
/// opens says only that the salon has published nothing. The admin is what makes the
/// application usable; this is what makes it legible.
/// </para>
/// </remarks>
public class SampleCatalogueOptions
{
    public const string SectionName = "SampleCatalogue";

    /// <summary>Whether to seed. Idempotent either way — see <c>DatabaseInitializer</c>.</summary>
    public bool Enabled { get; set; }
}
