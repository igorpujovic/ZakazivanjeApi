namespace ZakazivanjeApi.Dtos;

/// <summary>
/// An account as the outside world may see it. The <c>User</c> entity is never returned, so
/// <c>PasswordHash</c> has no shape in which it can leave the server.
/// </summary>
/// <param name="Role">The name of the role, <c>Client</c> or <c>Admin</c>, not its number.</param>
public record UserResponse(int Id, string Name, string Email, string Role);
