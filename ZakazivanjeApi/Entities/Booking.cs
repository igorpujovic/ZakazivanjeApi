namespace ZakazivanjeApi.Entities;

/// <summary>An agreement that one stylist will perform one service for one client, at a stated time.</summary>
public class Booking
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public int StylistId { get; set; }

    public Stylist Stylist { get; set; } = null!;

    /// <summary>Kept for reporting. What the client is charged and told comes from the snapshots below.</summary>
    public int ServiceId { get; set; }

    public Service Service { get; set; } = null!;

    /// <summary>Local salon wall-clock, <see cref="DateTimeKind.Unspecified"/>. Never UTC (ADR-0001).</summary>
    public DateTime Start { get; set; }

    /// <summary>Computed once at creation as <c>Start + Service.DurationMinutes</c> and stored.</summary>
    public DateTime End { get; set; }

    /// <summary>The price when the booking was made, so later catalogue edits do not rewrite history.</summary>
    public decimal PriceAtBooking { get; set; }

    /// <summary>The service name when the booking was made, for the same reason.</summary>
    public string ServiceNameAtBooking { get; set; } = string.Empty;

    public BookingStatus Status { get; set; } = BookingStatus.Scheduled;
}
