using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What an admin sends to put a new service on the menu. There is no <c>IsActive</c> here: a
/// service nobody could book is not worth creating, so it always starts active and
/// <c>DELETE</c> is what withdraws it (ADR-0004).
/// </summary>
public class CreateServiceRequest
{
    private readonly string _name = string.Empty;

    /// <summary>Required, and trimmed as it arrives.</summary>
    [Required(AllowEmptyStrings = false)]
    [StringLength(CatalogueLimits.NameLength)]
    public string Name
    {
        get => _name;

        // Trimmed during binding, so validation judges the value that will actually be stored.
        // Required alone passes a name of nothing but spaces, which trims away to no name at
        // all once it reaches the database.
        init => _name = value?.Trim() ?? string.Empty;
    }

    /// <summary>Positive, and capped at a day: it is what decides a booking's end time.</summary>
    [Range(1, CatalogueLimits.MaxDurationMinutes)]
    public int DurationMinutes { get; init; }

    /// <summary>In RSD. Free is allowed; owing the salon money is not.</summary>
    [Range(
        typeof(decimal),
        "0",
        CatalogueLimits.MaxPrice,
        ParseLimitsInInvariantCulture = true,
        ConvertValueInInvariantCulture = true)]
    public decimal Price { get; init; }
}
