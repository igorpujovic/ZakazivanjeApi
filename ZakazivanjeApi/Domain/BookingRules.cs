using Microsoft.Extensions.Options;

namespace ZakazivanjeApi.Domain;

/// <summary>
/// Every rule a booking must pass, as one dependency-free class: no EF Core, no
/// <c>DbContext</c>, no HTTP (ADR-0007). It is given the day's working hours and a clock, and
/// decides on plain values the caller has already loaded.
/// </summary>
public class BookingRules(IOptions<WorkingHoursOptions> workingHours, TimeProvider clock)
{
    /// <summary>
    /// How long before the start a client may still call a booking off. Two hours, and the
    /// deadline itself is still in time: the test is <c>now &lt;= Start - 2h</c>.
    /// </summary>
    public static readonly TimeSpan ClientCancellationDeadline = TimeSpan.FromHours(2);

    private readonly WorkingHoursOptions hours = workingHours.Value;

    /// <summary>
    /// Salon wall-clock now. Comes from the injected provider, never <c>DateTime.Now</c>, which
    /// is what lets every rule below be tested at a chosen moment (ADR-0001).
    /// </summary>
    private DateTime Now => clock.GetLocalNow().DateTime;

    /// <summary>
    /// Whether a proposed booking may be saved, given everything already occupying the
    /// stylist that day.
    /// </summary>
    public BookingRuleResult Check(
        ProposedBooking proposed, IReadOnlyCollection<TimeInterval> busy)
    {
        // Ordered from the most fundamental complaint to the most circumstantial. What was
        // chosen comes before when it was chosen for: no other time would rescue either of
        // these, so the client hears the useful thing first.
        if (!proposed.StylistIsActive)
        {
            return BookingRuleResult.Refused(BookingRuleFailure.StylistInactive());
        }

        if (!proposed.ServiceIsActive)
        {
            return BookingRuleResult.Refused(BookingRuleFailure.ServiceInactive());
        }

        return CheckTiming(proposed.Interval, busy);
    }

    /// <summary>
    /// The three rules about when a booking falls, as opposed to what it is for: it has not
    /// already passed, it fits the day's working hours end and all, and it is clear of
    /// everything already occupying the stylist. Slot generation runs exactly this, which is
    /// what stops the two ever disagreeing.
    /// </summary>
    private BookingRuleResult CheckTiming(
        TimeInterval interval, IReadOnlyCollection<TimeInterval> busy)
    {
        if (interval.Start < Now)
        {
            return BookingRuleResult.Refused(BookingRuleFailure.StartInPast());
        }

        if (!FitsWorkingHours(interval))
        {
            return BookingRuleResult.Refused(BookingRuleFailure.OutsideWorkingHours());
        }

        if (OverlapsAny(interval, busy))
        {
            return BookingRuleResult.Refused(BookingRuleFailure.Overlap());
        }

        return BookingRuleResult.Allowed;
    }

    /// <summary>
    /// Every start that could be offered for one day, stylist and service: a step of
    /// <see cref="WorkingHoursOptions.SlotGridMinutes"/> across the weekday's working hours,
    /// keeping the candidates where the whole service fits and nothing is in the way. Empty on
    /// a weekday the salon is closed, and empty rather than an error for a day already over.
    /// Whether the stylist is still active is the caller's to answer before asking.
    /// </summary>
    /// <param name="busy">
    /// What already occupies the stylist that day — Scheduled and Completed bookings, since a
    /// cancelled one releases its time.
    /// </param>
    public IReadOnlyList<DateTime> AvailableSlots(
        DateOnly date, int durationMinutes, IReadOnlyCollection<TimeInterval> busy)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(durationMinutes);

        if (hours.SlotGridMinutes <= 0)
        {
            throw new InvalidOperationException(
                $"WorkingHours:SlotGridMinutes is {hours.SlotGridMinutes}, so slot generation "
                    + "would never advance. Startup validation should have refused this.");
        }

        if (hours.ForDay(date.DayOfWeek) is not { } open)
        {
            return [];
        }

        var slots = new List<DateTime>();
        var close = date.ToDateTime(open.Close);

        for (var start = date.ToDateTime(open.Open);
            start < close;
            start = start.AddMinutes(hours.SlotGridMinutes))
        {
            var candidate = TimeInterval.Starting(start, durationMinutes);

            // Once the service no longer fits before closing, no later start will either.
            if (!FitsWorkingHours(candidate))
            {
                break;
            }

            // Judged by the very rules a booking will face, rather than by a second copy of
            // them, so this endpoint cannot offer a start POST /api/bookings would refuse.
            if (CheckTiming(candidate, busy).IsAllowed)
            {
                slots.Add(start);
            }
        }

        return slots;
    }

    /// <summary>
    /// Whether a booking starting at <paramref name="start"/> may still be called off. A client
    /// has until <see cref="ClientCancellationDeadline"/> before the start; an admin is bound by
    /// nothing, including by bookings already under way (ADR-0004).
    /// </summary>
    /// <param name="byAdmin">Whether salon staff, rather than the client, is cancelling.</param>
    public BookingRuleResult CheckCancellation(DateTime start, bool byAdmin)
    {
        if (byAdmin || Now <= start - ClientCancellationDeadline)
        {
            return BookingRuleResult.Allowed;
        }

        return BookingRuleResult.Refused(
            BookingRuleFailure.CancellationTooLate(ClientCancellationDeadline));
    }

    /// <summary>
    /// Whether the whole interval falls inside that weekday's working hours. The test is on the
    /// end as well as the start, so a service that would run past closing is refused. A weekday
    /// with no working hours is a closed day, and nothing fits inside it.
    /// </summary>
    private bool FitsWorkingHours(TimeInterval interval)
    {
        if (hours.ForDay(interval.Start.DayOfWeek) is not { } open)
        {
            return false;
        }

        var day = DateOnly.FromDateTime(interval.Start);

        return interval.Start >= day.ToDateTime(open.Open)
            && interval.End <= day.ToDateTime(open.Close);
    }

    /// <summary>
    /// Whether anything already occupying the stylist shares time with this interval. The
    /// caller decides what counts as occupied: only Scheduled and Completed bookings do, since
    /// a cancelled one releases the time.
    /// </summary>
    private static bool OverlapsAny(TimeInterval interval, IEnumerable<TimeInterval> busy) =>
        busy.Any(interval.Overlaps);
}
