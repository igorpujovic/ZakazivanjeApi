namespace ZakazivanjeApi.Dtos;

/// <summary>What a successful login hands back: a bearer token, when it dies, and who it is for.</summary>
/// <param name="AccessToken">Send as <c>Authorization: Bearer &lt;token&gt;</c>.</param>
/// <param name="ExpiresAt">
/// When the token stops being accepted. There are no refresh tokens: past this moment, log in
/// again (ADR-0006).
/// </param>
public record AuthResponse(
    string AccessToken, string TokenType, DateTimeOffset ExpiresAt, UserResponse User);
