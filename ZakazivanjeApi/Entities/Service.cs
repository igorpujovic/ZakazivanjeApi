namespace ZakazivanjeApi.Entities;

/// <summary>Something the salon sells, with the duration that decides a booking's end time.</summary>
public class Service
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Positive. A booking's <c>End</c> is <c>Start</c> plus this many minutes.</summary>
    public int DurationMinutes { get; set; }

    /// <summary>In RSD.</summary>
    public decimal Price { get; set; }

    /// <summary>Deactivated rather than deleted, so past bookings keep pointing at a real row.</summary>
    public bool IsActive { get; set; } = true;

    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
