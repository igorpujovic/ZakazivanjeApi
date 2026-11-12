namespace ZakazivanjeApi.Domain;

/// <summary>
/// A booking a client has asked for, reduced to the facts the rules need to judge it. Plain
/// values only — no entities and no <c>DbContext</c> reach the rules (ADR-0007). The two flags
/// are the catalogue's answer at the moment of asking, which is what rules 5 and 6 turn on.
/// </summary>
/// <param name="Start">Local salon wall-clock (ADR-0001).</param>
/// <param name="DurationMinutes">The chosen service's duration; it alone decides the end.</param>
/// <param name="StylistIsActive">Whether the chosen stylist may still take new bookings.</param>
/// <param name="ServiceIsActive">Whether the chosen service may still be booked.</param>
public readonly record struct ProposedBooking(
    DateTime Start,
    int DurationMinutes,
    bool StylistIsActive,
    bool ServiceIsActive)
{
    /// <summary>The time this booking would occupy, <c>[Start, Start + duration)</c>.</summary>
    public TimeInterval Interval => TimeInterval.Starting(Start, DurationMinutes);
}
