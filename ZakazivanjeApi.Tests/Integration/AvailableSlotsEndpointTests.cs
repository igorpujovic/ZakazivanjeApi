using System.Net;
using System.Text.Json;
using ZakazivanjeApi.Entities;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The one public question a client actually asks: when can I come in? Everything here goes
/// through HTTP, because the slot arithmetic itself already has unit tests and what is left to
/// prove is the wiring — which bookings count as busy, what an unknown or retired row does, and
/// that the clock the rules read is the application's own.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class AvailableSlotsEndpointTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>
    /// A booking written straight to the database rather than through
    /// <c>POST /api/bookings</c>, so that a failure here is a failure of the endpoint under
    /// test and never of the one that set it up.
    /// </summary>
    private Task<int> BookAsync(
        int stylistId,
        int serviceId,
        DateTime start,
        DateTime end,
        BookingStatus status = BookingStatus.Scheduled) =>
        factory.WithDbAsync(async db =>
        {
            var client = new User
            {
                Name = "Mila",
                Email = NewEmail("slots"),
                PasswordHash = "not-a-real-hash",
            };

            db.Users.Add(client);

            await db.SaveChangesAsync();

            var booking = new Booking
            {
                UserId = client.Id,
                StylistId = stylistId,
                ServiceId = serviceId,
                Start = start,
                End = end,
                PriceAtBooking = 9000m,
                ServiceNameAtBooking = "Coloring",
                Status = status,
            };

            db.Bookings.Add(booking);

            await db.SaveChangesAsync();

            return booking.Id;
        });

    /// <summary>
    /// Calls a booking off in the database, for the same reason, rather than through
    /// <c>PUT /api/bookings/{id}/cancel</c>.
    /// </summary>
    private async Task CancelAsync(int bookingId) =>
        await factory.WithDbAsync(async db =>
        {
            var booking = await db.Bookings.FindAsync(bookingId)
                ?? throw new InvalidOperationException($"No booking has id {bookingId}.");

            booking.Status = BookingStatus.Cancelled;

            return await db.SaveChangesAsync();
        });

    private Task<HttpResponseMessage> SlotsAsync(int stylistId, string query) =>
        _client.GetWithTokenAsync($"/api/stylists/{stylistId}/available-slots?{query}", null);

    private Task<HttpResponseMessage> SlotsAsync(int stylistId, int serviceId, DateOnly date) =>
        SlotsAsync(stylistId, $"date={date:yyyy-MM-dd}&serviceId={serviceId}");

    /// <summary>The offered starts as the salon would say them, e.g. <c>09:15</c>.</summary>
    private static string[] StartsIn(JsonElement body) =>
        [.. body.GetProperty("slots")
            .EnumerateArray()
            .Select(slot => slot.GetDateTime().ToString("HH:mm"))];

    [Fact]
    public async Task Offers_the_specifications_worked_example_end_to_end()
    {
        var monday = NextWeekday(DayOfWeek.Monday);
        var stylistId = await _client.NewStylistAsync();
        var serviceId = await _client.NewServiceAsync("Coloring", 90);

        await BookAsync(
            stylistId,
            serviceId,
            monday.ToDateTime(new TimeOnly(11, 0)),
            monday.ToDateTime(new TimeOnly(11, 30)));

        var response = await SlotsAsync(stylistId, serviceId, monday);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.BodyAsync();

        // The duration travels with the starts, so a caller knows what each one commits them to
        // without going back to the menu.
        Assert.Equal(90, body.GetProperty("durationMinutes").GetInt32());

        Assert.Equal(
            [
                // 09:30 is offered: 09:30 + 90min touches 11:00 without overlapping it.
                "09:00", "09:15", "09:30",

                // 09:45 through 11:15 would all run into the existing booking.
                "11:30", "11:45", "12:00", "12:15", "12:30", "12:45",
                "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45",

                // 15:30 is the last start that still ends by the 17:00 close.
                "15:00", "15:15", "15:30",
            ],
            StartsIn(body));
    }

    [Fact]
    public async Task Answers_an_unknown_stylist_with_a_not_found_rather_than_an_empty_day()
    {
        var response = await SlotsAsync(
            987654321, await _client.NewServiceAsync("Coloring", 45), NextWeekday(DayOfWeek.Monday));

        // "Nothing free" and "nobody to be free" are different answers, and a client told the
        // first would simply try again tomorrow.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(
            "stylist_not_found", (await response.BodyAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Answers_an_unknown_service_with_a_not_found()
    {
        var response = await SlotsAsync(
            await _client.NewStylistAsync(), 987654321, NextWeekday(DayOfWeek.Monday));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(
            "service_not_found", (await response.BodyAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Offers_nothing_on_a_weekday_the_salon_is_closed()
    {
        var response = await SlotsAsync(
            await _client.NewStylistAsync(),
            await _client.NewServiceAsync("Coloring", 45),
            NextWeekday(DayOfWeek.Sunday));

        // Closed is not broken. A client asking about Sunday gets a day with no starts in it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(StartsIn(await response.BodyAsync()));
    }

    [Fact]
    public async Task Offers_nothing_for_a_stylist_who_has_been_retired()
    {
        var stylistId = await _client.NewStylistAsync("Jelena");
        var serviceId = await _client.NewServiceAsync("Coloring", 45);

        (await _client.PutWithTokenAsync(
            $"/api/stylists/{stylistId}",
            await _client.AdminTokenAsync(),
            new { name = "Jelena", isActive = false }))
            .EnsureSuccessStatusCode();

        var response = await SlotsAsync(stylistId, serviceId, NextWeekday(DayOfWeek.Monday));

        // Not a 404: the stylist is still there, and every booking ever taken against them
        // still resolves (ADR-0004). They simply take nothing new.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(StartsIn(await response.BodyAsync()));
    }

    [Fact]
    public async Task Offers_nothing_for_a_service_withdrawn_from_the_menu()
    {
        var stylistId = await _client.NewStylistAsync();
        var serviceId = await _client.NewServiceAsync("Coloring", 45);

        (await _client.DeleteWithTokenAsync(
            $"/api/services/{serviceId}", await _client.AdminTokenAsync()))
            .EnsureSuccessStatusCode();

        var response = await SlotsAsync(stylistId, serviceId, NextWeekday(DayOfWeek.Monday));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(StartsIn(await response.BodyAsync()));
    }

    [Theory]
    [InlineData("serviceId=1", "date")]
    [InlineData("date=2026-11-16", "serviceId")]
    [InlineData("date=the-sixteenth&serviceId=1", "date")]
    [InlineData("date=2026-13-45&serviceId=1", "date")]
    public async Task Refuses_a_question_it_cannot_read(string query, string refusedField)
    {
        var response = await SlotsAsync(await _client.NewStylistAsync(), query);

        // A date it cannot parse is a bad question, not an empty day: answering 200 with no
        // slots would let a typo look like a fully booked salon.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            refusedField, await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Gives_a_cancelled_bookings_time_back()
    {
        var monday = NextWeekday(DayOfWeek.Monday);
        var stylistId = await _client.NewStylistAsync();
        var serviceId = await _client.NewServiceAsync("Coloring", 45);

        var bookingId = await BookAsync(
            stylistId,
            serviceId,
            monday.ToDateTime(new TimeOnly(11, 0)),
            monday.ToDateTime(new TimeOnly(11, 45)));

        Assert.DoesNotContain(
            "11:00", StartsIn(await (await SlotsAsync(stylistId, serviceId, monday)).BodyAsync()));

        await CancelAsync(bookingId);

        // The whole point of cancelling: the chair is free again, and the next client is told so
        // without anybody having to tidy anything up.
        Assert.Contains(
            "11:00", StartsIn(await (await SlotsAsync(stylistId, serviceId, monday)).BodyAsync()));
    }

    [Fact]
    public async Task Keeps_a_completed_bookings_time_occupied()
    {
        var monday = NextWeekday(DayOfWeek.Monday);
        var stylistId = await _client.NewStylistAsync();
        var serviceId = await _client.NewServiceAsync("Coloring", 45);

        await BookAsync(
            stylistId,
            serviceId,
            monday.ToDateTime(new TimeOnly(13, 0)),
            monday.ToDateTime(new TimeOnly(13, 45)),
            BookingStatus.Completed);

        // Completed, not cancelled: the stylist really was busy, so that hour was never free
        // and offering it would double-book a chair that has already been sat in.
        Assert.DoesNotContain(
            "13:00", StartsIn(await (await SlotsAsync(stylistId, serviceId, monday)).BodyAsync()));
    }

    [Fact]
    public async Task Offers_nothing_earlier_than_now_when_the_day_asked_about_is_today()
    {
        var monday = NextWeekday(DayOfWeek.Monday);
        var stylistId = await _client.NewStylistAsync();
        var serviceId = await _client.NewServiceAsync("Coloring", 60);

        // A second host over the same database, with the application's own clock standing at
        // 14:00 on the day being asked about. Pinning it here rather than asserting against the
        // real clock is also what proves the rules read the clock the application hands them.
        var atTwo = factory.CreateClientAt(monday.ToDateTime(new TimeOnly(14, 0)));

        var response = await atTwo.GetWithTokenAsync(
            $"/api/stylists/{stylistId}/available-slots?date={monday:yyyy-MM-dd}"
                + $"&serviceId={serviceId}",
            null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var starts = StartsIn(await response.BodyAsync());

        // The morning is gone, and offering it would mean offering a start POST /api/bookings
        // would then refuse as being in the past.
        Assert.Equal(
            [
                "14:00", "14:15", "14:30", "14:45",
                "15:00", "15:15", "15:30", "15:45",

                // 16:00 is the last start a 60-minute service can take before the 17:00 close.
                "16:00",
            ],
            starts);
    }
}
