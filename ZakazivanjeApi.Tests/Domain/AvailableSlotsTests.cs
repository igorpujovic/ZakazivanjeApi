using ZakazivanjeApi.Domain;
using static ZakazivanjeApi.Tests.Domain.TestSalon;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// The starts offered for one day, stylist and service. A slot is an offer, not a hold — but it
/// is an honest one: nothing is offered that a booking would then be refused for.
/// </summary>
public class AvailableSlotsTests
{
    private static string[] SlotsOn(
        DateOnly day, int durationMinutes, DateTime now, params TimeInterval[] busy) =>
        RulesAt(now)
            .AvailableSlots(day, durationMinutes, busy)
            .Select(slot => slot.ToString("HH:mm"))
            .ToArray();

    [Fact]
    public void Offers_the_specifications_worked_example_exactly()
    {
        // Open 09:00-17:00, a 90-minute colouring, one booking at 11:00-11:30.
        var slots = SlotsOn(Monday, 90, LongBefore, Between(Monday, "11:00", "11:30"));

        Assert.Equal(
            [
                // 09:30 is offered: 09:30 + 90min touches 11:00 without overlapping it.
                "09:00", "09:15", "09:30",

                // 09:45 through 11:15 would all run into the existing booking.
                "11:30", "11:45", "12:00", "12:15", "12:30", "12:45",
                "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45",

                // 15:30 is the last start that still ends by 17:00.
                "15:00", "15:15", "15:30",
            ],
            slots);
    }

    [Fact]
    public void Offers_slots_on_the_day_that_was_asked_for()
    {
        var slots = RulesAt(LongBefore).AvailableSlots(Saturday, 90, []);

        Assert.Equal(On(Saturday, "09:00"), slots[0]);
        Assert.Equal(On(Saturday, "12:30"), slots[^1]);
    }

    [Fact]
    public void Offers_nothing_on_a_weekday_the_salon_is_closed() =>
        Assert.Empty(SlotsOn(Sunday, 30, LongBefore));

    [Fact]
    public void Offers_nothing_when_the_service_is_longer_than_the_day() =>
        Assert.Empty(SlotsOn(Saturday, durationMinutes: 6 * 60, now: LongBefore));

    [Fact]
    public void Drops_the_starts_that_have_already_passed_today()
    {
        var slots = SlotsOn(Monday, 30, now: On(Monday, "10:07"));

        Assert.Equal("10:15", slots[0]);
        Assert.Equal("16:30", slots[^1]);
    }

    [Fact]
    public void Still_offers_a_start_falling_exactly_on_now() =>
        Assert.Equal("10:00", SlotsOn(Monday, 30, now: On(Monday, "10:00"))[0]);

    [Fact]
    public void Offers_nothing_on_a_day_that_is_over() =>
        Assert.Empty(SlotsOn(Monday, 30, now: On(Monday, "00:00").AddDays(7)));

    [Fact]
    public void Steps_by_the_configured_grid()
    {
        var slots = RulesAt(LongBefore, slotGridMinutes: 30)
            .AvailableSlots(Monday, 60, [])
            .Select(slot => slot.ToString("HH:mm"));

        Assert.Equal(["09:00", "09:30", "10:00"], slots.Take(3));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-30)]
    public void Refuses_to_generate_slots_for_a_service_with_no_duration(int durationMinutes) =>
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            RulesAt(LongBefore).AvailableSlots(Monday, durationMinutes, []));

    [Fact]
    public void Refuses_to_generate_slots_on_a_grid_that_would_never_advance()
    {
        // Startup validation rules this out, but a step of zero would otherwise loop forever,
        // and a hang is a far worse way to learn about a typo than an exception.
        Assert.Throws<InvalidOperationException>(() =>
            RulesAt(LongBefore, slotGridMinutes: 0).AvailableSlots(Monday, 30, []));
    }

    [Fact]
    public void Never_offers_a_start_that_booking_would_then_refuse()
    {
        // The promise the endpoint makes: every slot it hands out survives the booking rules.
        var now = On(Monday, "09:20");
        var busy = new[] { Between(Monday, "11:00", "11:30"), Between(Monday, "14:00", "15:00") };
        var rules = RulesAt(now);

        var slots = rules.AvailableSlots(Monday, 90, busy);

        Assert.NotEmpty(slots);
        Assert.All(
            slots,
            slot => Assert.True(
                rules.Check(new ProposedBooking(slot, 90, true, true), busy).IsAllowed,
                $"{slot:HH:mm} was offered but would be refused."));
    }
}
