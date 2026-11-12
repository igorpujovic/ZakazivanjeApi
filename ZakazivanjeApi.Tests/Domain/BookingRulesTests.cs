using ZakazivanjeApi.Domain;
using static ZakazivanjeApi.Tests.Domain.TestSalon;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// The rules a proposed booking must pass. No database, no mocking framework: the rules take
/// plain values and hand back a decision (ADR-0007).
/// </summary>
public class BookingRulesTests
{
    private static ProposedBooking Booking(
        DateOnly day,
        string start,
        int durationMinutes = 30,
        bool stylistIsActive = true,
        bool serviceIsActive = true) =>
        new(On(day, start), durationMinutes, stylistIsActive, serviceIsActive);

    private static BookingRuleResult Decide(
        DateTime now, ProposedBooking booking, params TimeInterval[] busy) =>
        RulesAt(now).Check(booking, busy);

    private static BookingRuleResult Propose(
        string start, int durationMinutes = 30, params TimeInterval[] busy) =>
        Decide(LongBefore, Booking(Monday, start, durationMinutes), busy);

    private static void AssertRefused(string code, BookingRuleResult result)
    {
        Assert.False(result.IsAllowed);
        Assert.Equal(code, result.Failure?.Code);
    }

    [Fact]
    public void Refuses_a_service_that_runs_past_closing_even_though_it_starts_in_hours()
    {
        // 16:45 is inside working hours; 16:45 + 30 minutes is not. The check is on End.
        AssertRefused("outside_working_hours", Propose("16:45", durationMinutes: 30));
    }

    [Fact]
    public void Accepts_a_service_that_ends_exactly_at_closing() =>
        Assert.True(Propose("16:30", durationMinutes: 30).IsAllowed);

    [Fact]
    public void Accepts_a_service_that_starts_exactly_at_opening() =>
        Assert.True(Propose("09:00").IsAllowed);

    [Fact]
    public void Refuses_a_start_before_the_salon_opens() =>
        AssertRefused("outside_working_hours", Propose("08:45"));

    [Fact]
    public void Refuses_a_booking_on_a_weekday_the_salon_is_closed() =>
        AssertRefused("outside_working_hours", Decide(LongBefore, Booking(Sunday, "10:00")));

    [Fact]
    public void Refuses_a_start_that_has_already_passed() =>
        AssertRefused(
            "start_in_past",
            Decide(On(Monday, "12:00"), Booking(Monday, "11:00")));

    [Fact]
    public void Accepts_a_start_exactly_equal_to_now()
    {
        // "In the past" means strictly before now. This moment has not passed yet.
        Assert.True(Decide(On(Monday, "11:00"), Booking(Monday, "11:00")).IsAllowed);
    }

    [Fact]
    public void Refuses_a_start_a_single_minute_in_the_past() =>
        AssertRefused(
            "start_in_past",
            Decide(On(Monday, "11:01"), Booking(Monday, "11:00")));

    [Fact]
    public void Refuses_a_booking_overlapping_one_the_stylist_already_has() =>
        AssertRefused(
            "booking_overlap",
            Propose("10:30", 60, Between(Monday, "11:00", "11:30")));

    [Fact]
    public void Accepts_a_booking_that_only_touches_the_one_before_it()
    {
        // Ends at 11:00, the moment the next one begins. Back-to-back is the salon's business
        // model, not a clash.
        Assert.True(Propose("09:30", 90, Between(Monday, "11:00", "11:30")).IsAllowed);
    }

    [Fact]
    public void Accepts_a_booking_that_only_touches_the_one_after_it() =>
        Assert.True(Propose("11:30", 30, Between(Monday, "11:00", "11:30")).IsAllowed);

    [Fact]
    public void Looks_at_every_booking_the_stylist_has_not_just_the_first() =>
        AssertRefused(
            "booking_overlap",
            Propose(
                "13:00",
                60,
                Between(Monday, "09:00", "10:00"),
                Between(Monday, "13:30", "14:00")));

    [Fact]
    public void Accepts_a_booking_in_the_gap_between_two_others() =>
        Assert.True(
            Propose(
                    "10:00",
                    60,
                    Between(Monday, "09:00", "10:00"),
                    Between(Monday, "11:00", "12:00"))
                .IsAllowed);

    [Fact]
    public void Refuses_a_stylist_who_has_been_retired() =>
        AssertRefused(
            "stylist_inactive",
            Decide(LongBefore, Booking(Monday, "10:00", stylistIsActive: false)));

    [Fact]
    public void Refuses_a_service_that_has_been_withdrawn() =>
        AssertRefused(
            "service_inactive",
            Decide(LongBefore, Booking(Monday, "10:00", serviceIsActive: false)));

    [Fact]
    public void Reports_a_retired_stylist_before_anything_about_the_time()
    {
        // Nothing about rescheduling would help here, so the client hears the useful thing
        // first rather than being sent round the clock.
        AssertRefused(
            "stylist_inactive",
            Decide(
                On(Monday, "12:00"),
                Booking(Monday, "08:00", stylistIsActive: false),
                Between(Monday, "08:00", "09:00")));
    }

    [Fact]
    public void Reports_the_impossible_time_before_the_closed_salon()
    {
        // Both rules refuse this one. The time being gone is the more fundamental complaint,
        // and pinning the order here stops the message changing by accident.
        AssertRefused(
            "start_in_past",
            Decide(On(Monday, "12:00"), Booking(Monday, "08:00")));
    }
}
