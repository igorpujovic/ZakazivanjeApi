using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What a visitor sends to open an account. There is deliberately no role here: registration
/// always produces a client, and a role field would let anyone make themselves an admin
/// (ADR-0006).
/// </summary>
public class RegisterRequest
{
    [Required(AllowEmptyStrings = false)]
    [StringLength(200, MinimumLength = 2)]
    public string Name { get; init; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    [EmailAddress]
    [StringLength(256)]
    public string Email { get; init; } = string.Empty;

    /// <summary>Hashed on arrival and never stored, returned or logged as given.</summary>
    [Required(AllowEmptyStrings = false)]
    [StringLength(128, MinimumLength = 8)]
    public string Password { get; init; } = string.Empty;
}
