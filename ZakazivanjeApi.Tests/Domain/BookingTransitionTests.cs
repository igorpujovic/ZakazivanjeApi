using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// The spec's status table, in one place and with no clock in it: a booking leaves
/// <see cref="BookingStatus.Scheduled"/> once, in one of two directions, and never comes back.
/// Who may do it and when is a separate question, asked by <c>BookingRules</c>.
/// </summary>
public class BookingTransitionTests
{
    [Theory]
    [InlineData(BookingStatus.Cancelled)]
    [InlineData(BookingStatus.Completed)]
    public void Lets_a_scheduled_booking_be_resolved_either_way(BookingStatus target) =>
        Assert.True(BookingTransitions.To(BookingStatus.Scheduled, target).IsAllowed);

    [Theory]
    [InlineData(BookingStatus.Cancelled, BookingStatus.Cancelled)]
    [InlineData(BookingStatus.Cancelled, BookingStatus.Completed)]
    [InlineData(BookingStatus.Completed, BookingStatus.Cancelled)]
    [InlineData(BookingStatus.Completed, BookingStatus.Completed)]
    public void Refuses_to_move_a_booking_that_is_already_resolved(
        BookingStatus current, BookingStatus target) =>
        Assert.False(BookingTransitions.To(current, target).IsAllowed);

    [Fact]
    public void Refuses_to_put_a_booking_back_to_scheduled()
    {
        // Nothing in the API asks for this, and the table is the place that says so rather
        // than the absence of an endpoint.
        Assert.False(
            BookingTransitions.To(BookingStatus.Cancelled, BookingStatus.Scheduled).IsAllowed);
        Assert.False(
            BookingTransitions.To(BookingStatus.Scheduled, BookingStatus.Scheduled).IsAllowed);
    }

    [Theory]
    [InlineData(BookingStatus.Cancelled, "booking_already_cancelled")]
    [InlineData(BookingStatus.Completed, "booking_already_completed")]
    [InlineData(BookingStatus.Scheduled, "booking_already_scheduled")]
    public void Says_in_a_code_which_way_the_booking_already_went(
        BookingStatus current, string expected)
    {
        // A code per status rather than one for "not scheduled": which way a booking already
        // went decides what the caller does next, and nobody should have to read the prose to
        // find that out.
        var result = BookingTransitions.To(current, BookingStatus.Scheduled);

        Assert.Equal(expected, result.Failure?.Code);
    }
}
