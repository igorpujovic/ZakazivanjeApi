using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What a client sends to take a booking. There is no client id here and no price: who is
/// booking comes from the token, and what it costs comes from the menu. Everything is nullable
/// so that a missing field is reported as the missing field it is, rather than silently
/// becoming stylist 0 at midnight on 1 January 0001.
/// </summary>
public class CreateBookingRequest : IValidatableObject
{
    [Required]
    public int? StylistId { get; init; }

    /// <summary>The service chosen. Its duration decides when the booking ends.</summary>
    [Required]
    public int? ServiceId { get; init; }

    /// <summary>
    /// Local salon wall-clock, e.g. <c>2026-11-16T10:00:00</c>. No offset and no <c>Z</c>: the
    /// salon has one clock and nothing is converted anywhere (ADR-0001).
    /// </summary>
    [Required]
    public DateTime? Start { get; init; }

    /// <summary>
    /// Refuses a start that carries a zone, rather than quietly shifting it.
    /// </summary>
    /// <remarks>
    /// <c>10:00+01:00</c> and <c>10:00Z</c> both bind to some other wall-clock time than ten
    /// o'clock, which would then be stored and shown as whatever the server's own zone made of
    /// it. The salon has one clock and converts nothing, at the boundary least of all
    /// (ADR-0001), so a time that means to be somewhere else is a bad request and is told so by
    /// name instead of being honoured as a different hour.
    /// </remarks>
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Start is { } start && start.Kind != DateTimeKind.Unspecified)
        {
            yield return new ValidationResult(
                "Send the salon's own wall-clock time, with no offset and no Z, "
                    + "e.g. 2026-11-16T10:00:00.",
                [nameof(Start)]);
        }
    }
}
