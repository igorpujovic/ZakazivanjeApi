namespace ZakazivanjeApi.Entities;

/// <summary>An account that can log in: either a client who books, or an admin who manages.</summary>
public class User
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Unique and compared case-insensitively, per the database collation.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>PBKDF2, produced by <c>PasswordHasher&lt;User&gt;</c>. Never the password itself.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.Client;

    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
