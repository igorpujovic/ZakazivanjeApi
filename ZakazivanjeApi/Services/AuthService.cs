using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Hand-written registration and login over the specification's <c>User</c> table. Only the
/// PBKDF2 hashing is borrowed from ASP.NET Core Identity; nothing else of it is adopted
/// (ADR-0006).
/// </summary>
public class AuthService(
    SalonDbContext db,
    IPasswordHasher<User> passwordHasher,
    ITokenService tokenService) : IAuthService
{
    /// <summary>
    /// One message for both ways a login can fail. An unknown email and a wrong password are
    /// indistinguishable from outside, so the endpoint cannot be used to enumerate accounts.
    /// </summary>
    private const string CredentialsRefused = "Email or password is incorrect.";

    /// <summary>
    /// A real hash to verify against when no user was found, so an unknown email costs about the
    /// same time as a known one. Without it the response time alone answers the question the
    /// shared message refuses to.
    /// </summary>
    /// <remarks>
    /// Produced by the injected hasher, not a fresh one: the whole trick is that verifying it
    /// costs what verifying a real password costs, which only holds while both are hashed with
    /// the same work factor. Held per process rather than per request, so an unknown email pays
    /// for one verification and not for a hash as well. Two threads racing here both compute an
    /// equivalent value, so whichever wins is as good as the other.
    /// </remarks>
    private static string? _decoyHash;

    private string DecoyHash =>
        _decoyHash ??= passwordHasher.HashPassword(new User(), "a-password-nobody-has");

    public async Task<UserResponse> RegisterAsync(
        RegisterRequest request, CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();

        // Checked first so the ordinary case answers with a conflict rather than a failed insert.
        // The unique index is what actually guarantees it; this only improves the common path.
        if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw EmailTaken();
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            Email = email,
            Role = UserRole.Client,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsDuplicateKey(exception))
        {
            // Two registrations for one address at once: the loser arrives here rather than at
            // the check above, and must still be told it is a conflict, not a server fault.
            // Email carries the only unique index on Users, so there is nothing else this can be.
            db.Entry(user).State = EntityState.Detached;
            throw EmailTaken();
        }

        return ToResponse(user);
    }

    public async Task<AuthResponse> LoginAsync(
        LoginRequest request, CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();

        // Matched case-insensitively by the database collation, which is also what makes the
        // unique index treat nina@salon.rs and Nina@Salon.rs as one account.
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null)
        {
            _ = passwordHasher.VerifyHashedPassword(new User(), DecoyHash, request.Password);
            throw CredentialsRejected();
        }

        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
            == PasswordVerificationResult.Failed)
        {
            throw CredentialsRejected();
        }

        var token = tokenService.Create(user);

        return new AuthResponse(token.Token, "Bearer", token.ExpiresAt, ToResponse(user));
    }

    private static UserResponse ToResponse(User user) =>
        new(user.Id, user.Name, user.Email, user.Role.ToString());

    /// <summary>
    /// The address is deliberately not quoted back. A conflict already tells the caller the
    /// account exists, so repeating it adds nothing and only echoes input into a response.
    /// </summary>
    private static DomainException EmailTaken() =>
        DomainException.Conflict("email_taken", "An account with that email already exists.");

    private static DomainException CredentialsRejected() =>
        DomainException.Unauthorized("invalid_credentials", CredentialsRefused);

    /// <summary>SQL Server's unique-violation numbers: 2627 for a constraint, 2601 for an index.</summary>
    private static bool IsDuplicateKey(DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: 2601 or 2627 };
}
