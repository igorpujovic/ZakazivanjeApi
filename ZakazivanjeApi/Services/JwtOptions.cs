using System.ComponentModel.DataAnnotations;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace ZakazivanjeApi.Services;

/// <summary>
/// How tokens are signed and how long they last (ADR-0006). <see cref="Key"/> is a secret and
/// never appears in a tracked file: user-secrets locally, environment variables elsewhere.
/// Validated at startup, so a missing or too-short key fails the boot rather than producing
/// tokens nobody can rely on.
/// </summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>
    /// The symmetric signing key. HMAC-SHA256 needs at least 256 bits of key, and
    /// <c>SymmetricSecurityKey</c> throws rather than truncating, so the length is enforced
    /// here where the message can say why.
    /// </summary>
    [Required(AllowEmptyStrings = false)]
    [MinLength(32, ErrorMessage = "Jwt:Key must be at least 32 characters for HMAC-SHA256.")]
    public string Key { get; set; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    public string Issuer { get; set; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    public string Audience { get; set; } = string.Empty;

    /// <summary>Sixty minutes per the specification. There are no refresh tokens (ADR-0006).</summary>
    [Range(1, 1440)]
    public int LifetimeMinutes { get; set; } = 60;

    /// <summary>
    /// The key in the form both signing and validation need it. Derived here rather than at each
    /// end, so the two cannot drift apart into tokens the API refuses to read back.
    /// </summary>
    public SymmetricSecurityKey SigningKey() => new(Encoding.UTF8.GetBytes(Key));

    /// <summary>
    /// Exactly what a token must satisfy to be accepted. One definition, used to configure the
    /// bearer handler and to read tokens back in tests, so a test cannot quietly validate against
    /// looser rules than the running API applies.
    /// </summary>
    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = true,
        ValidAudience = Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = SigningKey(),
        ValidateLifetime = true,

        // No grace: sixty minutes means sixty minutes.
        ClockSkew = TimeSpan.Zero,

        // The short names the token is minted with, rather than the long WS-* URIs.
        NameClaimType = ClaimNames.Subject,
        RoleClaimType = ClaimNames.Role,
    };
}
