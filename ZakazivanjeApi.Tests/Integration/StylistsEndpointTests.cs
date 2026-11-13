using System.Net;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The stylist half of the catalogue. A stylist has no login, so everything here is done to
/// them by an admin; the only public question is who can currently be booked.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class StylistsEndpointTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>Every route on this controller that only an admin may call.</summary>
    public static TheoryData<string, string> AdminRoutes =>
        new()
        {
            { "POST", "/api/stylists" },
            { "PUT", "/api/stylists/1" },
        };

    /// <summary>
    /// A body good enough that nothing but the caller role or a missing row can be what refuses
    /// it. It carries isActive for the sake of PUT; POST has no such field and ignores it.
    /// </summary>
    private static object ValidStylistBody => new { name = "Nina", isActive = true };

    /// <summary>The ids the public list is offering, read without a token.</summary>
    private async Task<IReadOnlyList<int>> ActiveStylistIdsAsync() =>
        await (await _client.GetWithTokenAsync("/api/stylists", null)).IdsAsync();

    [Fact]
    public async Task Creates_a_stylist_and_puts_them_on_the_public_list()
    {
        var response = await _client.PostWithTokenAsync(
            "/api/stylists", await _client.AdminTokenAsync(), new { name = "Nina" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var created = await response.BodyAsync();
        var id = created.GetProperty("id").GetInt32();

        Assert.True(id > 0);
        Assert.Equal("Nina", created.GetProperty("name").GetString());

        // Created active: a stylist nobody can book is not worth adding.
        Assert.True(created.GetProperty("isActive").GetBoolean());

        Assert.Contains(id, await ActiveStylistIdsAsync());
    }

    [Fact]
    public async Task Retires_a_stylist_through_update_and_can_bring_them_back()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewStylistAsync("Jelena", admin);

        var retired = await _client.PutWithTokenAsync(
            $"/api/stylists/{id}", admin, new { name = "Jelena", isActive = false });

        Assert.Equal(HttpStatusCode.OK, retired.StatusCode);
        Assert.False((await retired.BodyAsync()).GetProperty("isActive").GetBoolean());
        Assert.DoesNotContain(id, await ActiveStylistIdsAsync());

        var returned = await _client.PutWithTokenAsync(
            $"/api/stylists/{id}", admin, new { name = "Jelena Pavlovic", isActive = true });

        Assert.Equal(HttpStatusCode.OK, returned.StatusCode);
        Assert.Equal(
            "Jelena Pavlovic", (await returned.BodyAsync()).GetProperty("name").GetString());
        Assert.Contains(id, await ActiveStylistIdsAsync());
    }

    [Fact]
    public async Task Shows_an_admin_the_retired_stylists_only_when_asked_for_them()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewStylistAsync("Tamara", admin);

        (await _client.PutWithTokenAsync(
            $"/api/stylists/{id}", admin, new { name = "Tamara", isActive = false }))
            .EnsureSuccessStatusCode();

        var everyone = await _client.GetWithTokenAsync(
            "/api/stylists?includeInactive=true", admin);
        var bookable = await _client.GetWithTokenAsync("/api/stylists", admin);

        // Retiring a stylist was already possible; finding them afterwards was not. Without
        // the flag an admin sees the bookable list, exactly as a client does.
        Assert.Contains(id, await everyone.IdsAsync());
        Assert.DoesNotContain(id, await bookable.IdsAsync());
    }

    [Fact]
    public async Task Refuses_to_widen_the_list_for_a_caller_it_cannot_identify()
    {
        var response = await _client.GetWithTokenAsync("/api/stylists?includeInactive=true", null);

        // The services list refuses on exactly these terms. Two routes answering the same
        // question differently would be worse than either answer.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", await response.CodeAsync());
    }

    [Fact]
    public async Task Refuses_to_widen_the_list_for_a_client()
    {
        var response = await _client.GetWithTokenAsync(
            "/api/stylists?includeInactive=true", await _client.NewClientTokenAsync());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("forbidden", await response.CodeAsync());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Serves_the_bookable_list_to_anyone_who_asks_for_no_more_than_it(bool asClient)
    {
        var token = asClient ? await _client.NewClientTokenAsync() : null;

        var response = await _client.GetWithTokenAsync(
            "/api/stylists?includeInactive=false", token);

        // The gate is on widening the list, not on the parameter's presence: false is what
        // every caller already gets, so refusing it would be refusing the default. Asserted on
        // both routes, because "consistently across both" is the claim being made.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task Refuses_an_admin_route_to_a_caller_with_no_token(string method, string path)
    {
        var response = await _client.SendWithTokenAsync(
            new HttpMethod(method), path, null, ValidStylistBody);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task Turns_a_client_away_from_an_admin_route(string method, string path)
    {
        var response = await _client.SendWithTokenAsync(
            new HttpMethod(method), path, await _client.NewClientTokenAsync(), ValidStylistBody);

        // Forbidden, not unauthorized: the API knows exactly who this is and is refusing them.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Reads_the_list_without_a_token()
    {
        var response = await _client.GetWithTokenAsync("/api/stylists", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Answers_an_unknown_id_with_a_not_found_rather_than_a_null()
    {
        var response = await _client.PutWithTokenAsync(
            "/api/stylists/987654321", await _client.AdminTokenAsync(), ValidStylistBody);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Matched on the code, never the prose, as the error contract requires.
        Assert.Equal("stylist_not_found", (await response.BodyAsync())
            .GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Refuses_a_stylist_with_no_usable_name(string name)
    {
        var response = await _client.PostWithTokenAsync(
            "/api/stylists", await _client.AdminTokenAsync(), new { name });

        // A name of nothing but spaces is a missing name: it is trimmed as it binds, so
        // validation judges what would actually have been stored.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "name", await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refuses_an_update_that_does_not_say_whether_the_stylist_stays_on_the_list()
    {
        var admin = await _client.AdminTokenAsync();
        var id = await _client.NewStylistAsync("Sara", admin);

        (await _client.PutWithTokenAsync(
            $"/api/stylists/{id}", admin, new { name = "Sara", isActive = false }))
            .EnsureSuccessStatusCode();

        var response = await _client.PutWithTokenAsync(
            $"/api/stylists/{id}", admin, new { name = "Sara Ilic" });

        // isActive is required rather than defaulted, so correcting a name cannot quietly put a
        // retired stylist back in front of clients.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "isActive", await response.RefusedFieldsAsync(), StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain(id, await ActiveStylistIdsAsync());
    }
}
