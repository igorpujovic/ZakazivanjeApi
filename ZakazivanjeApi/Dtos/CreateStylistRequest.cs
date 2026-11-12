using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What an admin sends to add a stylist. A name is all there is: a stylist has no login and no
/// account, so there is nothing here to authenticate. No <c>IsActive</c> either, since a
/// stylist who cannot be booked is not worth adding; <c>PUT</c> is what retires one.
/// </summary>
public class CreateStylistRequest
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
}
