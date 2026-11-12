using System.Net;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// What a token is actually worth once the API reads it back: whether the pipeline identifies
/// the caller at all, and whether the role claim carries enough weight to open an admin route.
/// Exercised against the probe endpoints, since the first real protected route arrives later.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class AuthorizationTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Lets_anyone_reach_an_open_route()
    {
        // The control. If this failed, a 401 elsewhere would say nothing about tokens.
        var response = await _client.GetWithTokenAsync("/test-probe/anyone", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Identifies_a_bearer_even_on_a_route_that_requires_no_token()
    {
        var anonymous = await _client.GetWithTokenAsync("/test-probe/anyone", null);
        var bearer = await _client.GetWithTokenAsync(
            "/test-probe/anyone", await _client.NewClientTokenAsync());

        Assert.False((await anonymous.BodyAsync()).GetProperty("identified").GetBoolean());

        // A public route still learns who is calling, which is what the later public endpoints
        // lean on. Note what this does not prove: commenting UseAuthentication out of Program.cs
        // changes nothing here, because WebApplication inserts that middleware itself once the
        // authentication services are registered. The explicit calls pin the order for a reader
        // rather than enable the behaviour, so no test can distinguish their absence.
        Assert.True((await bearer.BodyAsync()).GetProperty("identified").GetBoolean());
    }

    [Fact]
    public async Task Refuses_a_protected_route_to_a_caller_with_no_token()
    {
        var response = await _client.GetWithTokenAsync("/test-probe/authenticated", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("not-a-token-at-all")]
    [InlineData("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.bm90LWEtc2lnbmF0dXJl")]
    public async Task Refuses_a_token_it_did_not_sign(string token)
    {
        var response = await _client.GetWithTokenAsync("/test-probe/authenticated", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Identifies_a_client_to_the_api_that_issued_their_token()
    {
        var response = await _client.GetWithTokenAsync(
            "/test-probe/authenticated", await _client.NewClientTokenAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.BodyAsync();

        // Read back under the short names the token was minted with, which is what switching
        // off inbound claim mapping buys: a sub that is still called sub.
        Assert.True(int.Parse(body.GetProperty("subject").GetString()!) > 0);
        Assert.EndsWith("@salon.test", body.GetProperty("email").GetString());
        Assert.False(body.GetProperty("isAdmin").GetBoolean());
    }

    [Fact]
    public async Task Turns_a_client_away_from_an_admin_route()
    {
        var response = await _client.GetWithTokenAsync(
            "/test-probe/admin-only", await _client.NewClientTokenAsync());

        // Forbidden, not unauthorized: the API knows exactly who this is and is refusing them.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Opens_an_admin_route_to_the_seeded_admin()
    {
        var token = await _client.TokenForAsync(
            SalonApiFactory.AdminEmail, SalonApiFactory.AdminPassword);

        var admin = await _client.GetWithTokenAsync("/test-probe/admin-only", token);
        var identity = await _client.GetWithTokenAsync("/test-probe/authenticated", token);

        Assert.Equal(HttpStatusCode.OK, admin.StatusCode);
        Assert.True((await identity.BodyAsync()).GetProperty("isAdmin").GetBoolean());
    }
}
