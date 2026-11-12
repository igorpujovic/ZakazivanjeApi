using static ZakazivanjeApi.Tests.Domain.TestSalon;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// A client may call off their own booking no later than two hours before it starts. An admin
/// is bound by nothing, including by bookings that have already started (ADR-0004).
/// </summary>
public class CancellationDeadlineTests
{
    private static readonly DateTime Start = On(Monday, "12:00");

    private static bool ClientMayCancelAt(string now) =>
        RulesAt(On(Monday, now)).CheckCancellation(Start, byAdmin: false).IsAllowed;

    [Fact]
    public void Lets_a_client_cancel_two_hours_and_a_minute_before() =>
        Assert.True(ClientMayCancelAt("09:59"));

    [Fact]
    public void Lets_a_client_cancel_at_exactly_two_hours_before()
    {
        // The deadline is the last moment allowed, not the first one refused.
        Assert.True(ClientMayCancelAt("10:00"));
    }

    [Fact]
    public void Stops_a_client_cancelling_an_hour_and_fifty_nine_minutes_before() =>
        Assert.False(ClientMayCancelAt("10:01"));

    [Fact]
    public void Stops_a_client_cancelling_a_booking_that_has_already_started() =>
        Assert.False(ClientMayCancelAt("12:30"));

    [Fact]
    public void Tells_a_refused_client_why_in_a_code_they_can_match_on()
    {
        var result = RulesAt(On(Monday, "11:00")).CheckCancellation(Start, byAdmin: false);

        Assert.Equal("cancellation_too_late", result.Failure?.Code);
    }

    [Theory]
    [InlineData("10:01")]  // past the client's deadline
    [InlineData("12:30")]  // after it started
    [InlineData("09:00")]  // and well before, of course
    public void Lets_an_admin_cancel_whenever_they_like(string now) =>
        Assert.True(RulesAt(On(Monday, now)).CheckCancellation(Start, byAdmin: true).IsAllowed);
}
