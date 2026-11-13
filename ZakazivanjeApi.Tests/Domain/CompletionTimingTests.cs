using static ZakazivanjeApi.Tests.Domain.TestSalon;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// An admin closes a booking out once it has started. The gate is on the start and not on the
/// end, so a stylist who finishes early can still mark the booking done (see the spec's status
/// table).
/// </summary>
public class CompletionTimingTests
{
    private static readonly DateTime Start = On(Monday, "12:00");

    private static bool MayCompleteAt(string now) =>
        RulesAt(On(Monday, now)).CheckCompletion(Start).IsAllowed;

    [Fact]
    public void Refuses_a_booking_whose_time_has_not_come() => Assert.False(MayCompleteAt("11:59"));

    [Fact]
    public void Allows_one_the_moment_it_starts()
    {
        // The start itself counts as passed: at 12:00 the client is in the chair.
        Assert.True(MayCompleteAt("12:00"));
    }

    [Fact]
    public void Allows_one_that_is_under_way() => Assert.True(MayCompleteAt("12:30"));

    [Fact]
    public void Allows_one_from_last_week()
    {
        // Past bookings still Scheduled are expected, not a bug: nobody has closed them out.
        Assert.True(RulesAt(On(Monday, "09:00").AddDays(7)).CheckCompletion(Start).IsAllowed);
    }

    [Fact]
    public void Tells_the_caller_why_in_a_code_they_can_match_on()
    {
        var result = RulesAt(On(Monday, "11:00")).CheckCompletion(Start);

        Assert.Equal("booking_not_started", result.Failure?.Code);
    }
}
