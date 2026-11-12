namespace ZakazivanjeApi.Entities;

/// <summary>Someone who performs services. A stylist has no login and no account.</summary>
public class Stylist
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Deactivated rather than deleted, so past bookings keep pointing at a real row.</summary>
    public bool IsActive { get; set; } = true;

    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
