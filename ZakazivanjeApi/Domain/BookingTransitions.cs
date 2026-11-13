using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Domain;

/// <summary>
/// The specification's status table, as one dependency-free decision: a booking may leave
/// <see cref="BookingStatus.Scheduled"/> for either terminal status, and may do nothing else
/// ever again. Every endpoint that changes a status asks here first, so the table lives in one
/// place rather than as a condition repeated at each of them (ADR-0007).
/// </summary>
/// <remarks>
/// Only what the statuses allow. Who is asking and whether the moment is right are separate
/// questions, answered by <see cref="BookingRules"/>, which needs a clock; this needs none.
/// </remarks>
public static class BookingTransitions
{
    /// <summary>
    /// Whether a booking currently <paramref name="current"/> may become
    /// <paramref name="target"/>. A refusal here is a conflict rather than a bad request: the
    /// caller asked a well-formed question of a booking that has already moved on.
    /// </summary>
    public static BookingRuleResult To(BookingStatus current, BookingStatus target)
    {
        var legal = current is BookingStatus.Scheduled
            && target is BookingStatus.Cancelled or BookingStatus.Completed;

        return legal
            ? BookingRuleResult.Allowed
            : BookingRuleResult.Refused(BookingRuleFailure.AlreadyIs(current));
    }
}
