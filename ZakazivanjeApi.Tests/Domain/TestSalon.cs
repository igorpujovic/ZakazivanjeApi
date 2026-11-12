using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using ZakazivanjeApi.Domain;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// One salon the rule tests share: open 09:00-17:00 on Monday, 09:00-14:00 on Saturday, closed
/// on Sunday, on a 15-minute grid. Every date below is a real weekday in 2026, so
/// <see cref="DateOnly.DayOfWeek"/> picks the intended entry rather than a coincidental one.
/// </summary>
internal static class TestSalon
{
    internal static readonly DateOnly Monday = new(2026, 11, 16);

    internal static readonly DateOnly Saturday = new(2026, 11, 21);

    internal static readonly DateOnly Sunday = new(2026, 11, 22);

    /// <summary>
    /// A week before every day under test, so a test that is not about the passage of time
    /// never has a booking refused for being in the past.
    /// </summary>
    internal static readonly DateTime LongBefore = On(Monday, "00:00").AddDays(-7);

    /// <summary>A wall-clock moment on a given day, written as the salon would say it.</summary>
    internal static DateTime On(DateOnly day, string time) =>
        day.ToDateTime(TimeOnly.Parse(time));

    /// <summary>A span of one day, such as a booking already occupying the stylist.</summary>
    internal static TimeInterval Between(DateOnly day, string start, string end) =>
        new(On(day, start), On(day, end));

    /// <summary>
    /// The rules as the application composes them, with "now" pinned. The fake provider's local
    /// zone is UTC, so the moment given here is exactly the wall-clock the rules read (ADR-0001).
    /// </summary>
    internal static BookingRules RulesAt(DateTime now, int slotGridMinutes = 15) =>
        new(Options.Create(WorkingHours(slotGridMinutes)),
            new FakeTimeProvider(new DateTimeOffset(now, TimeSpan.Zero)));

    internal static WorkingHoursOptions WorkingHours(int slotGridMinutes = 15) =>
        new()
        {
            SlotGridMinutes = slotGridMinutes,
            Days =
            {
                ["Monday"] = Hours("09:00", "17:00"),
                ["Saturday"] = Hours("09:00", "14:00"),
                ["Sunday"] = null,
            },
        };

    private static DayHours Hours(string open, string close) =>
        new() { Open = TimeOnly.Parse(open), Close = TimeOnly.Parse(close) };
}
