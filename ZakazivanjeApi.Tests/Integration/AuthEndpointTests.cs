using System.Net;
using Microsoft.IdentityModel.JsonWebTokens;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// Registration and login over HTTP, against the real database. These are the only tests that
/// can speak to what the unique index, the collation and the seeded admin actually do.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class AuthEndpointTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>
    /// The claims of a token the API just issued. Read, not validated: validation is exercised
    /// by <c>JwtTokenServiceTests</c>, and what matters here is what a client is handed.
    /// </summary>
    private static JsonWebToken Decode(System.Text.Json.JsonElement loginBody) =>
        new JsonWebTokenHandler().ReadJsonWebToken(loginBody.GetProperty("accessToken").GetString());

    [Fact]
    public async Task Creates_a_client_and_never_echoes_the_password_back()
    {
        var email = NewEmail("nina");

        var response = await _client.RegisterAsync(email);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await response.BodyAsync();

        Assert.True(body.GetProperty("id").GetInt32() > 0);
        Assert.Equal("Nina", body.GetProperty("name").GetString());
        Assert.Equal(email, body.GetProperty("email").GetString());

        // Registration always produces a client; there is no way to ask for a role (ADR-0006).
        Assert.Equal("Client", body.GetProperty("role").GetString());

        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(GoodPassword, raw);
        Assert.DoesNotContain("passwordHash", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Hands_back_a_usable_token_after_registering()
    {
        var email = NewEmail("milica");
        var registered = await (await _client.RegisterAsync(email)).BodyAsync();

        var response = await _client.LoginAsync(email, GoodPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.BodyAsync();
        var token = Decode(body);

        Assert.Equal("Bearer", body.GetProperty("tokenType").GetString());
        Assert.Equal(registered.GetProperty("id").GetInt32().ToString(), token.Subject);
        Assert.Equal(email, token.GetClaim("email").Value);
        Assert.Equal("Client", token.GetClaim("role").Value);

        // Sixty minutes, and still ahead of us (ADR-0006). No refresh token is offered.
        Assert.Equal(60, Math.Round((token.ValidTo - token.ValidFrom).TotalMinutes));
        Assert.True(body.GetProperty("expiresAt").GetDateTimeOffset() > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Refuses_an_email_that_already_has_an_account()
    {
        var email = NewEmail("duplicate");
        await _client.RegisterAsync(email);

        var response = await _client.RegisterAsync(email);

        // A conflict, not a 500 escaping from the unique index.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("email_taken", (await response.BodyAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Lets_only_one_of_several_simultaneous_registrations_win()
    {
        var email = NewEmail("stampede");

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 8).Select(_ => _client.RegisterAsync(email)));

        // Whichever requests get past the up-front check land on the unique index instead, and
        // must come back as conflicts too. The assertion is on the outcome rather than on which
        // of the two paths each request took, so it holds however the race happens to fall.
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(
            responses.Where(r => r.StatusCode != HttpStatusCode.Created),
            r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    [Fact]
    public async Task Treats_the_same_address_in_different_cases_as_one_account()
    {
        var email = NewEmail("nina");
        await _client.RegisterAsync(email);

        var again = await _client.RegisterAsync(email.ToUpperInvariant());
        var login = await _client.LoginAsync(email.ToUpperInvariant(), GoodPassword);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Refuses_a_wrong_password_exactly_as_it_refuses_an_unknown_email()
    {
        var known = NewEmail("known");
        await _client.RegisterAsync(known);

        var wrongPassword = await _client.LoginAsync(known, "Wrong-Horse-9");
        var unknownEmail = await _client.LoginAsync(NewEmail("stranger"), GoodPassword);

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);

        // Same code and same prose, so the response cannot be used to find out who has an
        // account here.
        var refused = await wrongPassword.BodyAsync();
        var missing = await unknownEmail.BodyAsync();

        Assert.Equal("invalid_credentials", refused.GetProperty("code").GetString());
        Assert.Equal(
            refused.GetProperty("code").GetString(), missing.GetProperty("code").GetString());
        Assert.Equal(
            refused.GetProperty("detail").GetString(), missing.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Logs_the_seeded_admin_in_with_a_token_that_says_so()
    {
        var response = await _client.LoginAsync(
            SalonApiFactory.AdminEmail, SalonApiFactory.AdminPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.BodyAsync();

        Assert.Equal("Admin", body.GetProperty("user").GetProperty("role").GetString());
        Assert.Equal("Admin", Decode(body).GetClaim("role").Value);
    }

    [Theory]
    [InlineData("", GoodPassword)]               // no email
    [InlineData("not-an-email", GoodPassword)]
    [InlineData("someone@salon.test", "short")]  // under the minimum length
    public async Task Refuses_a_registration_whose_shape_is_wrong(string email, string password)
    {
        var response = await _client.RegisterAsync(email, password);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
