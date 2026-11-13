using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Domain;

/// <summary>
/// Why a rule refused, in terms a client can act on. <see cref="Code"/> is the contract —
/// clients and tests match on it, never on the prose (ADR-0007).
/// </summary>
/// <param name="Code">Lower snake case, e.g. <c>booking_overlap</c>.</param>
/// <param name="Message">A sentence for a human, safe to show.</param>
public sealed record BookingRuleFailure(string Code, string Message)
{
    internal static BookingRuleFailure Overlap() =>
        new("booking_overlap", "That stylist already has a booking overlapping this time.");

    internal static BookingRuleFailure OutsideWorkingHours() =>
        new(
            "outside_working_hours",
            "The booking does not fit entirely inside the salon's working hours that day.");

    internal static BookingRuleFailure StartInPast() =>
        new("start_in_past", "A booking cannot start in the past.");

    internal static BookingRuleFailure CancellationTooLate(TimeSpan deadline) =>
        new(
            "cancellation_too_late",
            $"A booking can only be cancelled up to {deadline.TotalHours:0.#} hours before it "
                + "starts.");

    /// <summary>
    /// A code per status a booking can already be in, rather than one for "not scheduled".
    /// Which way a booking already went decides what a caller does next — nothing, or look at
    /// the other outcome — and the specification is explicit that nobody should have to read
    /// the prose to find out.
    /// </summary>
    internal static BookingRuleFailure AlreadyIs(BookingStatus current) => current switch
    {
        BookingStatus.Cancelled => new(
            "booking_already_cancelled", "That booking has already been cancelled."),
        BookingStatus.Completed => new(
            "booking_already_completed", "That booking has already been completed."),
        _ => new("booking_already_scheduled", "That booking is already scheduled."),
    };

    internal static BookingRuleFailure NotStarted() =>
        new(
            "booking_not_started",
            "A booking cannot be marked completed before it has started.");

    internal static BookingRuleFailure StylistInactive() =>
        new("stylist_inactive", "That stylist is no longer taking bookings.");

    internal static BookingRuleFailure ServiceInactive() =>
        new("service_inactive", "That service is no longer on offer.");
}

/// <summary>
/// What a rule decided: allowed, or refused with a reason. Rules return these rather than
/// throwing, which keeps them free of HTTP and keeps their tests free of exception
/// assertions (ADR-0007). <c>BookingService</c> is the one place that turns a refusal into a
/// <see cref="DomainException"/>.
/// </summary>
public readonly record struct BookingRuleResult
{
    private BookingRuleResult(BookingRuleFailure? failure) => Failure = failure;

    /// <summary>Nothing stands in the booking's way.</summary>
    public static BookingRuleResult Allowed => default;

    /// <summary><c>null</c> exactly when the booking is allowed.</summary>
    public BookingRuleFailure? Failure { get; }

    public bool IsAllowed => Failure is null;

    public static BookingRuleResult Refused(BookingRuleFailure failure) => new(failure);
}
