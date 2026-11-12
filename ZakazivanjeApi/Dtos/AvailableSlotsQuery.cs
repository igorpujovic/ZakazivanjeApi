using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What a client has to say to be told when they can come in. Both are required and both are
/// nullable so that leaving one out is reported as the missing field it is, rather than
/// silently becoming a default date nobody asked about.
/// </summary>
public class AvailableSlotsQuery
{
    /// <summary>The day to look at, <c>yyyy-MM-dd</c>. Local salon dates (ADR-0001).</summary>
    [Required]
    public DateOnly? Date { get; init; }

    /// <summary>The service being considered: its duration is what decides what fits.</summary>
    [Required]
    public int? ServiceId { get; init; }
}
