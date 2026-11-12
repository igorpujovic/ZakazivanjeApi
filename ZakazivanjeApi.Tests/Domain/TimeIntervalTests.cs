using ZakazivanjeApi.Domain;
using static ZakazivanjeApi.Tests.Domain.TestSalon;

namespace ZakazivanjeApi.Tests.Domain;

public class TimeIntervalTests
{
    /// <summary>An interval on one fixed day, so only the times under test vary.</summary>
    private static TimeInterval Span(string start, string end) => Between(Monday, start, end);

    /// <summary>Overlap is symmetric, so every case is asserted both ways round.</summary>
    private static void AssertOverlap(bool expected, TimeInterval a, TimeInterval b)
    {
        Assert.Equal(expected, a.Overlaps(b));
        Assert.Equal(expected, b.Overlaps(a));
    }

    [Theory]
    [InlineData("10:00", "11:00", "10:15", "10:45")]  // one wholly inside the other
    [InlineData("10:00", "11:00", "09:30", "10:30")]  // partial, overlapping from the left
    [InlineData("10:00", "11:00", "10:30", "11:30")]  // partial, overlapping from the right
    [InlineData("10:00", "11:00", "10:00", "11:00")]  // identical
    [InlineData("10:00", "11:00", "10:00", "10:30")]  // sharing a start
    [InlineData("10:00", "11:00", "10:30", "11:00")]  // sharing an end
    public void Intervals_sharing_any_time_overlap(
        string aStart, string aEnd, string bStart, string bEnd) =>
        AssertOverlap(true, Span(aStart, aEnd), Span(bStart, bEnd));

    [Fact]
    public void Touching_intervals_do_not_overlap()
    {
        // The rule the whole schedule rests on: back-to-back bookings are legal, so a booking
        // ending at 11:00 leaves 11:00 free for the next one.
        AssertOverlap(false, Span("10:00", "11:00"), Span("11:00", "12:00"));
    }

    [Fact]
    public void Separated_intervals_do_not_overlap() =>
        AssertOverlap(false, Span("10:00", "11:00"), Span("13:00", "14:00"));

    [Fact]
    public void Starting_measures_the_end_from_the_services_duration() =>
        Assert.Equal(
            Span("09:30", "11:00"),
            TimeInterval.Starting(On(Monday, "09:30"), durationMinutes: 90));

    [Theory]
    [InlineData(0)]
    [InlineData(-30)]
    public void Starting_refuses_a_duration_that_is_not_time_at_all(int durationMinutes) =>
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TimeInterval.Starting(On(Monday, "09:30"), durationMinutes));
}
