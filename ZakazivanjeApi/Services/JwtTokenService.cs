using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Hand-written JWT issuing, symmetric key, no refresh tokens (ADR-0006). "Now" comes from the
/// injected <see cref="TimeProvider"/> so the lifetime is testable without waiting an hour.
/// </summary>
public class JwtTokenService(IOptions<JwtOptions> options, TimeProvider timeProvider) : ITokenService
{
    private static readonly JsonWebTokenHandler Handler = new();

    private readonly JwtOptions _options = options.Value;

    public AccessToken Create(User user)
    {
        var issuedAt = timeProvider.GetUtcNow();
        var expiresAt = issuedAt.AddMinutes(_options.LifetimeMinutes);

        var credentials =
            new SigningCredentials(_options.SigningKey(), SecurityAlgorithms.HmacSha256);

        // Claim types are written out literally. The inbound mapping that would rename them to
        // the long WS-* URIs is switched off where the token is validated, so what is minted
        // here is exactly what the API reads back.
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = issuedAt.UtcDateTime,
            NotBefore = issuedAt.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = credentials,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(ClaimNames.Role, user.Role.ToString()),

                // No jti: it identifies a token so that one can be revoked, and there is no
                // token store to revoke it in (ADR-0006). An id nothing reads is noise.
            ]),
        };

        return new AccessToken(Handler.CreateToken(descriptor), expiresAt);
    }
}

/// <summary>The claim types this API mints and reads, named in one place so the two cannot drift.</summary>
public static class ClaimNames
{
    public const string Subject = JwtRegisteredClaimNames.Sub;

    public const string Email = JwtRegisteredClaimNames.Email;

    /// <summary>
    /// Short, as the specification names it. <c>ClaimTypes.Role</c> is the long WS-* URI, which
    /// would put a different name in the token, so authorization is pointed at this instead.
    /// </summary>
    public const string Role = "role";
}
