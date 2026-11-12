using ZakazivanjeApi.Dtos;

namespace ZakazivanjeApi.Services;

/// <summary>Opening an account and proving you own one.</summary>
public interface IAuthService
{
    /// <summary>
    /// Creates a client account. Throws a <c>DomainException</c> carrying <c>email_taken</c> if
    /// the address is already in use.
    /// </summary>
    Task<UserResponse> RegisterAsync(
        RegisterRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Issues a token for correct credentials. Throws a <c>DomainException</c> carrying
    /// <c>invalid_credentials</c> otherwise — the same failure for an unknown email as for a
    /// wrong password, so the response never says which accounts exist.
    /// </summary>
    Task<AuthResponse> LoginAsync(
        LoginRequest request, CancellationToken cancellationToken = default);
}
