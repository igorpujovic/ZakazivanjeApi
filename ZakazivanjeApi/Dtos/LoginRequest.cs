using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// Credentials offered at the door. The email carries no format validation on purpose: telling
/// a caller their email is malformed before checking it is one more way of saying which
/// addresses exist here.
/// </summary>
public class LoginRequest
{
    [Required(AllowEmptyStrings = false)]
    [StringLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    [StringLength(128)]
    public string Password { get; init; } = string.Empty;
}
