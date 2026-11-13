using System.Net;
using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Entities;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The five booking endpoints, through HTTP. The arithmetic behind them already has unit
/// tests; what is left to prove is the wiring — who may call what, which fields are written
/// once and never recalculated, and that the status table is enforced where a booking changes.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class BookingsEndpointTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>
    /// A moment on the next such weekday a week or more out, so a test about a rule is never
    /// also a test about the clock. Unspecified kind, exactly as a client would send it
    /// (ADR-0001).
    /// </summary>
    private static DateTime Next(DayOfWeek weekday, string time) =>
        NextWeekday(weekday).ToDateTime(TimeOnly.Parse(time));

    /// <summary>
    /// A client whose id is known as well as their token, which is what lets a booking be put
    /// in their name without going through the endpoint under test.
    /// </summary>
    private async Task<(int Id, string Token)> NewClientAsync()
    {
        var email = NewEmail("booking");
        var registered = await _client.RegisterAsync(email);

        registered.EnsureSuccessStatusCode();

        return (
            (await registered.BodyAsync()).GetProperty("id").GetInt32(),
            await _client.TokenForAsync(email, GoodPassword));
    }

    /// <summary>
    /// A booking written straight to the database, for the states <c>POST /api/bookings</c>
    /// cannot produce: one starting within the cancellation deadline, one already in the past,
    /// one already resolved. The endpoint under test is then the only one in the test.
    /// </summary>
    private Task<int> ExistingBookingAsync(
        int clientId,
        int stylistId,
        int serviceId,
        DateTime start,
        int durationMinutes = 45,
        BookingStatus status = BookingStatus.Scheduled) =>
        factory.WithDbAsync(async db =>
        {
            var booking = new Booking
            {
                UserId = clientId,
                StylistId = stylistId,
                ServiceId = serviceId,
                Start = start,
                End = start.AddMinutes(durationMinutes),
                PriceAtBooking = 2500m,
                ServiceNameAtBooking = "Haircut",
                Status = status,
            };

            db.Bookings.Add(booking);

            await db.SaveChangesAsync();

            return booking.Id;
        });

    [Fact]
    public async Task Takes_a_booking_and_writes_down_what_was_agreed()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Coloring", 90, 9000m, admin);
        var start = Next(DayOfWeek.Monday, "10:00");

        var response = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId, serviceId, start });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var booking = await response.BodyAsync();

        Assert.Equal(start, booking.GetProperty("start").GetDateTime());

        // The three snapshots: taken once, from the service as it was at this moment (ADR-0003).
        Assert.Equal(start.AddMinutes(90), booking.GetProperty("end").GetDateTime());
        Assert.Equal(9000m, booking.GetProperty("price").GetDecimal());
        Assert.Equal("Coloring", booking.GetProperty("serviceName").GetString());
        Assert.Equal("Scheduled", booking.GetProperty("status").GetString());
        Assert.Equal(stylistId, booking.GetProperty("stylistId").GetInt32());
    }

    [Fact]
    public async Task Refuses_a_booking_that_overlaps_one_already_taken()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Coloring", 90, 9000m, admin);

        (await _client.PostWithTokenAsync(
                "/api/bookings",
                client,
                new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") }))
            .EnsureSuccessStatusCode();

        // 11:00 is inside the 10:00-11:30 already taken.
        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "11:00") });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("booking_overlap", await response.CodeAsync());
    }

    [Fact]
    public async Task Allows_a_booking_that_only_touches_the_one_before_it()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Coloring", 90, 9000m, admin);

        (await _client.PostWithTokenAsync(
                "/api/bookings",
                client,
                new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") }))
            .EnsureSuccessStatusCode();

        // 11:30 is the moment the first booking stops occupying the chair, not a moment it
        // shares with it. Back-to-back is the whole point of a half-open interval.
        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "11:30") });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    /// <summary>
    /// The test the serializable transaction exists for (ADR-0005). Both requests are in flight
    /// at once against the same stylist and the same start, which is a check-then-act race in
    /// any implementation that checks for overlap and then inserts.
    /// </summary>
    [Fact]
    public async Task Lets_exactly_one_of_two_simultaneous_bookings_through()
    {
        var admin = await _client.AdminTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var first = await _client.NewClientTokenAsync();
        var second = await _client.NewClientTokenAsync();
        var body = new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "12:00") };

        // Started before either is awaited, so the two are genuinely in the air together rather
        // than one after the other.
        var responses = await Task.WhenAll(
            _client.PostWithTokenAsync("/api/bookings", first, body),
            _client.PostWithTokenAsync("/api/bookings", second, body));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);

        var loser = Assert.Single(
            responses, response => response.StatusCode == HttpStatusCode.Conflict);

        // A collision, not a database fault: the loser is told what happened in a code.
        Assert.Equal("booking_overlap", await loser.CodeAsync());

        var rows = await factory.WithDbAsync(db =>
            db.Bookings.CountAsync(booking => booking.StylistId == stylistId));

        Assert.Equal(1, rows);
    }

    [Fact]
    public async Task Refuses_a_start_that_has_already_gone_by()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        // A Monday a week behind us, at an hour the salon is open: nothing but the date itself
        // is wrong with it.
        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00").AddDays(-14) });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("start_in_past", await response.CodeAsync());
    }

    [Theory]
    [InlineData("2026-11-16T10:00:00+01:00")]
    [InlineData("2026-11-16T10:00:00Z")]
    public async Task Refuses_a_start_that_claims_to_be_in_some_other_zone(string start)
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        var response = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId, serviceId, start });

        // Honouring it would mean booking an hour the client did not ask for, because the
        // offset would be converted away against the server's own zone (ADR-0001).
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            ["start"],
            (await response.RefusedFieldsAsync()),
            StringComparer.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(DayOfWeek.Monday, "16:30")]  // ends at 17:15, a quarter hour past closing
    [InlineData(DayOfWeek.Sunday, "10:00")]  // a day the salon is shut
    public async Task Refuses_a_booking_the_working_hours_do_not_hold(
        DayOfWeek weekday, string time)
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(weekday, time) });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("outside_working_hours", await response.CodeAsync());
    }

    [Fact]
    public async Task Refuses_a_stylist_who_has_been_retired()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        (await _client.PutWithTokenAsync(
                $"/api/stylists/{stylistId}", admin, new { name = "Nina", isActive = false }))
            .EnsureSuccessStatusCode();

        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("stylist_inactive", await response.CodeAsync());
    }

    [Fact]
    public async Task Refuses_a_service_that_has_been_withdrawn()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        (await _client.DeleteWithTokenAsync($"/api/services/{serviceId}", admin))
            .EnsureSuccessStatusCode();

        var response = await _client.PostWithTokenAsync(
            "/api/bookings",
            client,
            new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("service_inactive", await response.CodeAsync());
    }

    [Fact]
    public async Task Answers_an_unknown_stylist_or_service_with_a_not_found()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var start = Next(DayOfWeek.Monday, "10:00");

        var noStylist = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId = 999_999, serviceId, start });

        var noService = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId, serviceId = 999_999, start });

        Assert.Equal(HttpStatusCode.NotFound, noStylist.StatusCode);
        Assert.Equal("stylist_not_found", await noStylist.CodeAsync());
        Assert.Equal(HttpStatusCode.NotFound, noService.StatusCode);
        Assert.Equal("service_not_found", await noService.CodeAsync());
    }

    [Fact]
    public async Task Refuses_a_request_that_leaves_fields_out()
    {
        var client = await _client.NewClientTokenAsync();

        var response = await _client.PostWithTokenAsync("/api/bookings", client, new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Case-insensitively: whether the keys arrive camel-cased is the serializer's business.
        Assert.Equal(
            ["serviceId", "start", "stylistId"],
            (await response.RefusedFieldsAsync()).Order(StringComparer.OrdinalIgnoreCase),
            StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Books_for_clients_only()
    {
        var admin = await _client.AdminTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var body = new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") };

        // An admin books nobody in: the client is taken from the token, so an admin booking
        // would be an admin booking themselves an appointment.
        var byAdmin = await _client.PostWithTokenAsync("/api/bookings", admin, body);
        var byNobody = await _client.PostWithTokenAsync("/api/bookings", null, body);

        Assert.Equal(HttpStatusCode.Forbidden, byAdmin.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, byNobody.StatusCode);
    }

    [Fact]
    public async Task Shows_a_client_their_own_bookings_in_the_order_they_come()
    {
        var admin = await _client.AdminTokenAsync();
        var mine = await _client.NewClientTokenAsync();
        var theirs = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        // Booked out of order, so the response cannot be in order by accident.
        foreach (var time in new[] { "13:00", "09:00", "11:00" })
        {
            (await _client.PostWithTokenAsync(
                    "/api/bookings",
                    mine,
                    new { stylistId, serviceId, start = Next(DayOfWeek.Monday, time) }))
                .EnsureSuccessStatusCode();
        }

        (await _client.PostWithTokenAsync(
                "/api/bookings",
                theirs,
                new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "15:00") }))
            .EnsureSuccessStatusCode();

        var response = await _client.GetWithTokenAsync("/api/bookings/my", mine);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var starts = (await response.BodyAsync())
            .EnumerateArray()
            .Select(booking => booking.GetProperty("start").GetDateTime().ToString("HH:mm"));

        // Theirs is absent, and the three that are mine are in the order I will live them.
        Assert.Equal(["09:00", "11:00", "13:00"], starts);
    }

    [Fact]
    public async Task Keeps_the_price_the_booking_was_made_at()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Coloring", 90, 9000m, admin);

        (await _client.PostWithTokenAsync(
                "/api/bookings",
                client,
                new { stylistId, serviceId, start = Next(DayOfWeek.Monday, "10:00") }))
            .EnsureSuccessStatusCode();

        // The salon puts its prices up and renames the service afterwards (ADR-0003).
        (await _client.PutWithTokenAsync(
                $"/api/services/{serviceId}",
                admin,
                new
                {
                    name = "Full colour",
                    durationMinutes = 120,
                    price = 12000m,
                    isActive = true,
                }))
            .EnsureSuccessStatusCode();

        var response = await _client.GetWithTokenAsync("/api/bookings/my", client);
        var booking = (await response.BodyAsync()).EnumerateArray().Single();

        Assert.Equal(9000m, booking.GetProperty("price").GetDecimal());
        Assert.Equal("Coloring", booking.GetProperty("serviceName").GetString());

        // And the longer duration has not stretched a booking already taken over the one
        // after it, which is the half of this that could break the stylist's schedule.
        Assert.Equal(
            Next(DayOfWeek.Monday, "11:30"), booking.GetProperty("end").GetDateTime());
    }

    [Fact]
    public async Task Keeps_the_my_bookings_list_for_clients_only()
    {
        var admin = await _client.AdminTokenAsync();

        var byAdmin = await _client.GetWithTokenAsync("/api/bookings/my", admin);
        var byNobody = await _client.GetWithTokenAsync("/api/bookings/my", null);

        // An admin has the whole list at /api/bookings; "my" is a client's word for their own.
        Assert.Equal(HttpStatusCode.Forbidden, byAdmin.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, byNobody.StatusCode);
    }

    [Fact]
    public async Task Lets_a_client_call_off_their_own_booking_in_good_time()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var start = Next(DayOfWeek.Monday, "10:00");

        var created = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId, serviceId, start });
        var id = (await created.BodyAsync()).GetProperty("id").GetInt32();

        var response = await _client.PutWithTokenAsync(
            $"/api/bookings/{id}/cancel", client);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Cancelled", (await response.BodyAsync()).GetProperty("status").GetString());

        // And the chair is free again: a cancelled booking releases the stylist's time.
        var again = await _client.PostWithTokenAsync(
            "/api/bookings", client, new { stylistId, serviceId, start });

        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    [Fact]
    public async Task Hides_another_clients_booking_rather_than_refusing_it()
    {
        var admin = await _client.AdminTokenAsync();
        var mine = await NewClientAsync();
        var stranger = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var id = await ExistingBookingAsync(
            mine.Id, stylistId, serviceId, Next(DayOfWeek.Monday, "10:00"));

        var response = await _client.PutWithTokenAsync($"/api/bookings/{id}/cancel", stranger);

        // 404 rather than 403: whether a booking exists is not a stranger's business, and a
        // 403 would answer that question for them.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("booking_not_found", await response.CodeAsync());

        var survived = await factory.WithDbAsync(db =>
            db.Bookings.AsNoTracking().SingleAsync(booking => booking.Id == id));

        Assert.Equal(BookingStatus.Scheduled, survived.Status);
    }

    [Fact]
    public async Task Holds_a_client_to_the_cancellation_deadline_and_holds_an_admin_to_nothing()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await NewClientAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        // An hour and fifty-nine minutes out: inside the two-hour deadline, and getting more so
        // while the test runs. Written straight to the database because no booking this close
        // to now could have been made through the API, which also refuses starts in the past.
        var start = DateTime.Now.AddMinutes(119);
        var id = await ExistingBookingAsync(client.Id, stylistId, serviceId, start);

        var byClient = await _client.PutWithTokenAsync(
            $"/api/bookings/{id}/cancel", client.Token);

        Assert.Equal(HttpStatusCode.Conflict, byClient.StatusCode);
        Assert.Equal("cancellation_too_late", await byClient.CodeAsync());

        // The salon can always resolve a booking, which is what makes a no-show or an
        // unreachable client something anybody can clear up (ADR-0004).
        var byAdmin = await _client.PutWithTokenAsync($"/api/bookings/{id}/cancel", admin);

        Assert.Equal(HttpStatusCode.OK, byAdmin.StatusCode);
        Assert.Equal("Cancelled", (await byAdmin.BodyAsync()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Refuses_to_cancel_a_booking_that_is_already_resolved()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await NewClientAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var id = await ExistingBookingAsync(
            client.Id,
            stylistId,
            serviceId,
            Next(DayOfWeek.Monday, "10:00"),
            status: BookingStatus.Cancelled);

        var response = await _client.PutWithTokenAsync(
            $"/api/bookings/{id}/cancel", client.Token);

        // 409 and not 400: the request is perfectly well-formed, the booking has just moved on.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("booking_already_cancelled", await response.CodeAsync());
    }

    [Fact]
    public async Task Answers_a_cancellation_of_nothing_with_a_not_found()
    {
        var client = await _client.NewClientTokenAsync();

        var byClient = await _client.PutWithTokenAsync("/api/bookings/999999/cancel", client);
        var byNobody = await _client.PutWithTokenAsync("/api/bookings/999999/cancel", null);

        Assert.Equal(HttpStatusCode.NotFound, byClient.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, byNobody.StatusCode);
    }

    [Fact]
    public async Task Refuses_to_complete_a_booking_whose_time_has_not_come()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await NewClientAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var id = await ExistingBookingAsync(
            client.Id, stylistId, serviceId, Next(DayOfWeek.Monday, "10:00"));

        var response = await _client.PutWithTokenAsync($"/api/bookings/{id}/complete", admin);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("booking_not_started", await response.CodeAsync());
    }

    [Fact]
    public async Task Completes_a_booking_that_has_started()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await NewClientAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        // Started an hour ago and still Scheduled, which is the ordinary state of a booking
        // nobody has closed out yet rather than a bug.
        var id = await ExistingBookingAsync(
            client.Id, stylistId, serviceId, DateTime.Now.AddHours(-1));

        var response = await _client.PutWithTokenAsync($"/api/bookings/{id}/complete", admin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Completed", (await response.BodyAsync()).GetProperty("status").GetString());

        // Terminal: there is nowhere left for it to go, in either direction.
        var again = await _client.PutWithTokenAsync($"/api/bookings/{id}/complete", admin);
        var cancelled = await _client.PutWithTokenAsync($"/api/bookings/{id}/cancel", admin);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("booking_already_completed", await again.CodeAsync());
        Assert.Equal(HttpStatusCode.Conflict, cancelled.StatusCode);
        Assert.Equal("booking_already_completed", await cancelled.CodeAsync());
    }

    [Fact]
    public async Task Completes_bookings_for_admins_only()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await NewClientAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var id = await ExistingBookingAsync(
            client.Id, stylistId, serviceId, DateTime.Now.AddHours(-1));

        var byClient = await _client.PutWithTokenAsync(
            $"/api/bookings/{id}/complete", client.Token);
        var byNobody = await _client.PutWithTokenAsync($"/api/bookings/{id}/complete", null);
        var missing = await _client.PutWithTokenAsync("/api/bookings/999999/complete", admin);

        // Whether the service happened is the salon's word, not the client's.
        Assert.Equal(HttpStatusCode.Forbidden, byClient.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, byNobody.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Shows_an_admin_a_day_of_one_stylists_bookings()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);
        var monday = Next(DayOfWeek.Monday, "09:00");

        foreach (var start in new[]
        {
            monday,
            monday.AddHours(2),
            Next(DayOfWeek.Tuesday, "09:00"),
        })
        {
            (await _client.PostWithTokenAsync(
                    "/api/bookings", client, new { stylistId, serviceId, start }))
                .EnsureSuccessStatusCode();
        }

        var response = await _client.GetWithTokenAsync(
            $"/api/bookings?stylistId={stylistId}&date={monday:yyyy-MM-dd}", admin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var page = await response.BodyAsync();

        // Tuesday is a different day and is not in a Monday's list.
        Assert.Equal(2, page.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, page.GetProperty("page").GetInt32());
        Assert.Equal(20, page.GetProperty("pageSize").GetInt32());
        Assert.Equal(1, page.GetProperty("totalPages").GetInt32());

        var starts = page.GetProperty("items")
            .EnumerateArray()
            .Select(booking => booking.GetProperty("start").GetDateTime().ToString("HH:mm"));

        Assert.Equal(["09:00", "11:00"], starts);

        // And the list is of use to a salon: it says who is coming in, not only when.
        var first = page.GetProperty("items").EnumerateArray().First();

        Assert.Equal("Nina", first.GetProperty("stylistName").GetString());
        Assert.False(string.IsNullOrWhiteSpace(first.GetProperty("clientName").GetString()));
    }

    [Fact]
    public async Task Pages_the_list_without_losing_or_repeating_a_booking()
    {
        var admin = await _client.AdminTokenAsync();
        var client = await _client.NewClientTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Haircut", 45, 2500m, admin);

        foreach (var time in new[] { "10:30", "09:00", "09:45" })
        {
            (await _client.PostWithTokenAsync(
                    "/api/bookings",
                    client,
                    new { stylistId, serviceId, start = Next(DayOfWeek.Monday, time) }))
                .EnsureSuccessStatusCode();
        }

        var first = await PageAsync($"/api/bookings?stylistId={stylistId}&page=1&pageSize=2");
        var second = await PageAsync($"/api/bookings?stylistId={stylistId}&page=2&pageSize=2");

        Assert.Equal(["09:00", "09:45"], StartsIn(first));
        Assert.Equal(["10:30"], StartsIn(second));
        Assert.Equal(3, first.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, first.GetProperty("totalPages").GetInt32());

        async Task<System.Text.Json.JsonElement> PageAsync(string path)
        {
            var response = await _client.GetWithTokenAsync(path, admin);

            response.EnsureSuccessStatusCode();

            return await response.BodyAsync();
        }
    }

    [Fact]
    public async Task Caps_how_much_of_the_list_can_be_asked_for_at_once()
    {
        var admin = await _client.AdminTokenAsync();

        var capped = await _client.GetWithTokenAsync("/api/bookings?pageSize=500", admin);
        var nonsense = await _client.GetWithTokenAsync("/api/bookings?page=0", admin);

        // Asking for too much is answered with the most there is, because a page size is a
        // request and not an instruction; asking for page nothing is a request that means
        // nothing at all.
        Assert.Equal(HttpStatusCode.OK, capped.StatusCode);
        Assert.Equal(100, (await capped.BodyAsync()).GetProperty("pageSize").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, nonsense.StatusCode);
    }

    [Fact]
    public async Task Keeps_the_whole_list_for_admins_only()
    {
        var client = await _client.NewClientTokenAsync();

        var byClient = await _client.GetWithTokenAsync("/api/bookings", client);
        var byNobody = await _client.GetWithTokenAsync("/api/bookings", null);

        Assert.Equal(HttpStatusCode.Forbidden, byClient.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, byNobody.StatusCode);
    }

    /// <summary>
    /// The whole journey, through nothing but HTTP: a stranger opens an account, finds a free
    /// time the way a client actually would, takes it, sees it, and calls it off. Every other
    /// test here starts somewhere in the middle; this one is the proof that the pieces join up.
    /// </summary>
    [Fact]
    public async Task Takes_a_stranger_from_registering_to_cancelling()
    {
        var admin = await _client.AdminTokenAsync();
        var stylistId = await _client.NewStylistAsync("Nina", admin);
        var serviceId = await _client.NewServiceAsync("Coloring", 90, 9000m, admin);
        var monday = NextWeekday(DayOfWeek.Monday);

        var email = NewEmail("journey");

        (await _client.RegisterAsync(email)).EnsureSuccessStatusCode();

        var token = await _client.TokenForAsync(email, GoodPassword);

        // A client reads the menu and the list of stylists before anything else, and neither
        // of those needs an account.
        Assert.Contains(
            serviceId,
            (await (await _client.GetWithTokenAsync("/api/services", null)).BodyAsync())
                .EnumerateArray()
                .Select(service => service.GetProperty("id").GetInt32()));

        var slots = await SlotsAsync(stylistId, serviceId, monday);
        var chosen = slots[2];

        var created = await _client.PostWithTokenAsync(
            "/api/bookings", token, new { stylistId, serviceId, start = chosen });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var id = (await created.BodyAsync()).GetProperty("id").GetInt32();

        // The offer has become a booking, so it is no longer on offer.
        Assert.DoesNotContain(chosen, await SlotsAsync(stylistId, serviceId, monday));

        var mine = (await (await _client.GetWithTokenAsync("/api/bookings/my", token))
            .BodyAsync())
            .EnumerateArray()
            .Single();

        Assert.Equal(id, mine.GetProperty("id").GetInt32());
        Assert.Equal("Scheduled", mine.GetProperty("status").GetString());
        Assert.Equal("Nina", mine.GetProperty("stylistName").GetString());

        var cancelled = await _client.PutWithTokenAsync($"/api/bookings/{id}/cancel", token);

        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal(
            "Cancelled", (await cancelled.BodyAsync()).GetProperty("status").GetString());

        // And the time is back on offer, because a cancelled booking releases it.
        Assert.Contains(chosen, await SlotsAsync(stylistId, serviceId, monday));
    }

    /// <summary>The starts a client would be shown for a day, stylist and service.</summary>
    private async Task<IReadOnlyList<DateTime>> SlotsAsync(
        int stylistId, int serviceId, DateOnly date)
    {
        var response = await _client.GetWithTokenAsync(
            $"/api/stylists/{stylistId}/available-slots?date={date:yyyy-MM-dd}"
                + $"&serviceId={serviceId}",
            null);

        response.EnsureSuccessStatusCode();

        return [.. (await response.BodyAsync())
            .GetProperty("slots")
            .EnumerateArray()
            .Select(slot => slot.GetDateTime())];
    }

    /// <summary>The start times in a page of bookings, as the salon would read them off.</summary>
    private static IEnumerable<string> StartsIn(System.Text.Json.JsonElement page) =>
        page.GetProperty("items")
            .EnumerateArray()
            .Select(booking => booking.GetProperty("start").GetDateTime().ToString("HH:mm"));
}
