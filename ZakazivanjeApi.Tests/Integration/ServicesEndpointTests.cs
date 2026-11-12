using System.Net;
using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Entities;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The service half of the catalogue: who may change it, what the public sees, and what
/// withdrawing one does and does not touch (ADR-0004).
/// </summary>
[Collection(IntegrationCollection.Name)]
public class ServicesEndpointTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>Every route on this controller that only an admin may call.</summary>
    public static TheoryData<string, string> AdminRoutes =>
        new()
        {
            { "POST", "/api/services" },
            { "PUT", "/api/services/1" },
            { "DELETE", "/api/services/1" },
        };

    /// <summary>
    /// A body good enough that nothing but the caller role or a missing row can be what refuses
    /// it. It carries isActive for the sake of PUT; POST has no such field and ignores it.
    /// </summary>
    private static object ValidServiceBody =>
        new { name = "Haircut", durationMinutes = 45, price = 2500m, isActive = true };

    /// <summary>The ids the public menu is offering, read without a token.</summary>
    private async Task<IReadOnlyList<int>> MenuIdsAsync()
    {
        var response = await _client.GetWithTokenAsync("/api/services", null);

        response.EnsureSuccessStatusCode();

        return [.. (await response.BodyAsync())
            .EnumerateArray()
            .Select(service => service.GetProperty("id").GetInt32())];
    }

    /// <summary>
    /// A scheduled booking against <paramref name="serviceId"/>, written straight to the
    /// database because the endpoint that would make one arrives in a later issue.
    /// </summary>
    private async Task<int> BookingAgainstAsync(int serviceId) =>
        await factory.WithDbAsync(async db =>
        {
            var stylist = new Stylist { Name = "Nina" };
            var client = new User
            {
                Name = "Mila",
                Email = NewEmail("booked"),
                PasswordHash = "not-a-real-hash",
            };

            db.Stylists.Add(stylist);
            db.Users.Add(client);

            await db.SaveChangesAsync();

            var booking = new Booking
            {
                UserId = client.Id,
                StylistId = stylist.Id,
                ServiceId = serviceId,

                // Far enough ahead that no rule arriving in a later issue finds it in the past.
                Start = new DateTime(2099, 1, 5, 10, 0, 0),
                End = new DateTime(2099, 1, 5, 12, 0, 0),
                PriceAtBooking = 9000m,
                ServiceNameAtBooking = "Balayage",
            };

            db.Bookings.Add(booking);

            await db.SaveChangesAsync();

            return booking.Id;
        });

    [Fact]
    public async Task Creates_a_service_and_says_where_to_read_it()
    {
        var response = await _client.PostWithTokenAsync(
            "/api/services",
            await _client.AdminTokenAsync(),
            new { name = "Haircut", durationMinutes = 45, price = 2500.00m });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.BodyAsync();
        var id = created.GetProperty("id").GetInt32();

        Assert.True(id > 0);
        Assert.Equal("Haircut", created.GetProperty("name").GetString());
        Assert.Equal(45, created.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(2500.00m, created.GetProperty("price").GetDecimal());

        // Created active: there is no field asking for it, because a service nobody can book is
        // not worth creating.
        Assert.True(created.GetProperty("isActive").GetBoolean());

        // The header points at a route that exists, which is the whole reason for sending one.
        Assert.EndsWith($"/api/services/{id}", response.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Drops_a_deactivated_service_from_the_menu_but_still_resolves_it_by_id()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewServiceAsync("Coloring", admin: admin);

        Assert.Contains(id, await MenuIdsAsync());

        var deactivated = await _client.DeleteWithTokenAsync($"/api/services/{id}", admin);

        Assert.Equal(HttpStatusCode.NoContent, deactivated.StatusCode);
        Assert.DoesNotContain(id, await MenuIdsAsync());

        // Still readable by id, which is what a booking taken against it needs (ADR-0004).
        var byId = await _client.GetWithTokenAsync($"/api/services/{id}", null);

        Assert.Equal(HttpStatusCode.OK, byId.StatusCode);
        Assert.False((await byId.BodyAsync()).GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Withdrawing_a_service_twice_succeeds_both_times()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewServiceAsync("Perm", admin: admin);

        var first = await _client.DeleteWithTokenAsync($"/api/services/{id}", admin);
        var second = await _client.DeleteWithTokenAsync($"/api/services/{id}", admin);

        // The caller asked for a state, and it holds. A conflict would say they had done
        // something wrong, and they had not.
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
    }

    [Fact]
    public async Task Updates_a_service_and_can_put_a_withdrawn_one_back_on_the_menu()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewServiceAsync("Trim", admin: admin);

        (await _client.DeleteWithTokenAsync($"/api/services/{id}", admin))
            .EnsureSuccessStatusCode();

        var response = await _client.PutWithTokenAsync(
            $"/api/services/{id}",
            admin,
            new { name = "Trim and dry", durationMinutes = 60, price = 3000m, isActive = true });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var updated = await response.BodyAsync();

        Assert.Equal(id, updated.GetProperty("id").GetInt32());
        Assert.Equal("Trim and dry", updated.GetProperty("name").GetString());
        Assert.Equal(60, updated.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(3000m, updated.GetProperty("price").GetDecimal());
        Assert.True(updated.GetProperty("isActive").GetBoolean());

        // Update carries isActive, so withdrawing something is not a one-way door.
        Assert.Contains(id, await MenuIdsAsync());
    }

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task Refuses_an_admin_route_to_a_caller_with_no_token(string method, string path)
    {
        var response = await _client.SendWithTokenAsync(
            new HttpMethod(method), path, null, ValidServiceBody);

        // Authorization is settled before the action runs, so whether id 1 exists never enters
        // into it. That is the point: an unauthenticated caller learns nothing about the data.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task Turns_a_client_away_from_an_admin_route(string method, string path)
    {
        var response = await _client.SendWithTokenAsync(
            new HttpMethod(method), path, await _client.NewClientTokenAsync(), ValidServiceBody);

        // Forbidden, not unauthorized: the API knows exactly who this is and is refusing them.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Reads_the_menu_and_one_service_without_a_token()
    {
        var id = await _client.NewServiceAsync("Beard trim");

        var menu = await _client.GetWithTokenAsync("/api/services", null);
        var one = await _client.GetWithTokenAsync($"/api/services/{id}", null);

        Assert.Equal(HttpStatusCode.OK, menu.StatusCode);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
    }

    [Theory]
    [InlineData("GET", false)]
    [InlineData("PUT", true)]
    [InlineData("DELETE", true)]
    public async Task Answers_an_unknown_id_with_a_not_found_rather_than_a_null(
        string method, bool needsAdmin)
    {
        var token = needsAdmin ? await _client.AdminTokenAsync() : null;

        var response = await _client.SendWithTokenAsync(
            new HttpMethod(method), "/api/services/987654321", token, ValidServiceBody);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Matched on the code, never the prose, as the error contract requires.
        Assert.Equal("service_not_found", (await response.BodyAsync())
            .GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("", 45, 2500, "name")]
    [InlineData("   ", 45, 2500, "name")]
    [InlineData("Haircut", 0, 2500, "durationMinutes")]
    [InlineData("Haircut", -30, 2500, "durationMinutes")]
    [InlineData("Haircut", 45, -1, "price")]
    public async Task Refuses_an_invalid_service_and_names_the_field(
        string name, int durationMinutes, decimal price, string field)
    {
        var response = await _client.PostWithTokenAsync(
            "/api/services",
            await _client.AdminTokenAsync(),
            new { name, durationMinutes, price });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            field, await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("   ", 45, 2500, "name")]
    [InlineData("Haircut", 0, 2500, "durationMinutes")]
    [InlineData("Haircut", 45, -1, "price")]
    public async Task Refuses_an_invalid_update_and_names_the_field(
        string name, int durationMinutes, decimal price, string field)
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewServiceAsync("Highlights", admin: admin);

        var response = await _client.PutWithTokenAsync(
            $"/api/services/{id}", admin, new { name, durationMinutes, price, isActive = true });

        // The same rules as creation: an update is where they could have been forgotten.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            field, await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refuses_an_update_that_does_not_say_whether_the_service_stays_on_the_menu()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewServiceAsync("Keratin", admin: admin);

        (await _client.DeleteWithTokenAsync($"/api/services/{id}", admin))
            .EnsureSuccessStatusCode();

        var response = await _client.PutWithTokenAsync(
            $"/api/services/{id}",
            admin,
            new { name = "Keratin", durationMinutes = 90, price = 7000m });

        // isActive is required rather than defaulted, so correcting a name cannot quietly put a
        // withdrawn service back in front of clients.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "isActive", await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain(id, await MenuIdsAsync());
    }

    [Fact]
    public async Task Leaves_the_bookings_taken_against_a_withdrawn_service_scheduled()
    {
        var admin = await _client.AdminTokenAsync();
        var serviceId = await _client.NewServiceAsync("Balayage", 120, 9000m, admin);
        var bookingId = await BookingAgainstAsync(serviceId);

        (await _client.DeleteWithTokenAsync($"/api/services/{serviceId}", admin))
            .EnsureSuccessStatusCode();

        var booking = await factory.WithDbAsync(db =>
            db.Bookings.AsNoTracking().SingleAsync(b => b.Id == bookingId));

        // Withdrawing something from the menu must not quietly cancel the bookings already
        // taken against it. The salon resolves those one at a time (ADR-0004).
        Assert.Equal(BookingStatus.Scheduled, booking.Status);
        Assert.Equal(serviceId, booking.ServiceId);
        Assert.Equal(9000m, booking.PriceAtBooking);
        Assert.Equal("Balayage", booking.ServiceNameAtBooking);
    }
}
