using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>A signed token and the moment it stops being accepted.</summary>
/// <param name="Token">The compact JWT, to be sent as <c>Authorization: Bearer</c>.</param>
/// <param name="ExpiresAt">
/// When the token expires. Offset-aware rather than salon wall-clock: expiry is a property of
/// the token, read by clients in other time zones, not of the salon's day (ADR-0001 governs
/// booking times, not this).
/// </param>
public readonly record struct AccessToken(string Token, DateTimeOffset ExpiresAt);

/// <summary>Issues the bearer tokens that prove who a caller is and what role they hold.</summary>
public interface ITokenService
{
    /// <summary>Issues a token for <paramref name="user"/>, valid from now for the configured lifetime.</summary>
    AccessToken Create(User user);
}
