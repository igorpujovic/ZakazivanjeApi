using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static ZakazivanjeApi.Tests.Integration.SalonApiClient;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// One envelope for every failure. A client that can read one refusal can read all of them,
/// which is the whole point of answering in ProblemDetails (RFC 9457) rather than in whatever
/// shape each layer of the stack would produce left to itself.
/// </summary>
/// <remarks>
/// Each case here goes through a real route, because the thing under test is what reaches the
/// wire and not what the handler intended. The statuses come from four different places — a
/// rule, DataAnnotations, the authorization middleware, routing — and that is exactly why they
/// are worth pinning together.
/// </remarks>
[Collection(IntegrationCollection.Name)]
public class ErrorEnvelopeTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Answers_a_missing_token_in_the_same_envelope()
    {
        var response = await _client.GetWithTokenAsync("/api/bookings/my", null);

        await AssertEnvelope(response, HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    public async Task Answers_a_caller_without_the_role_in_the_same_envelope()
    {
        var response = await _client.GetWithTokenAsync(
            "/api/bookings", await _client.NewClientTokenAsync());

        await AssertEnvelope(response, HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    public async Task Answers_a_route_that_does_not_exist_in_the_same_envelope()
    {
        // Routing refuses this one before any controller is reached, which is the case most
        // likely to fall out of the envelope: nothing of the application has run yet.
        var response = await _client.GetAsync("/api/nothing-here");

        await AssertEnvelope(response, HttpStatusCode.NotFound, "not_found");
    }

    [Fact]
    public async Task Answers_a_malformed_body_in_the_same_envelope()
    {
        // DataAnnotations and the [ApiController] convention produce this one, by a route that
        // never touches the exception handler. It carries the per-field errors on top of the
        // envelope — a superset of it, not a dialect of its own.
        var response = await _client.PostAsJsonAsync(
            "/api/auth/register", new { name = "", email = "not-an-email", password = "short" });

        var body = await AssertEnvelope(response, HttpStatusCode.BadRequest, "invalid_request");

        Assert.NotEmpty(body.GetProperty("errors").EnumerateObject());
    }

    [Fact]
    public async Task Answers_a_refused_rule_in_the_same_envelope()
    {
        var email = NewEmail("envelope");

        (await _client.RegisterAsync(email)).EnsureSuccessStatusCode();

        var response = await _client.RegisterAsync(email);

        // The rule names its own code. A generic "conflict" here would be a step backwards: the
        // envelope is uniform, the code within it is as specific as the layer that set it.
        var body = await AssertEnvelope(response, HttpStatusCode.Conflict, "email_taken");

        Assert.NotEqual(string.Empty, body.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Answers_a_missing_record_in_the_same_envelope()
    {
        var response = await _client.PutWithTokenAsync(
            "/api/bookings/987654/cancel", await _client.NewClientTokenAsync());

        await AssertEnvelope(response, HttpStatusCode.NotFound, "booking_not_found");
    }

    [Fact]
    public async Task Answers_an_unforeseen_failure_with_nothing_internal_in_it()
    {
        var logs = new CapturedLogs();
        var client = factory.WithFailingStylists(logs).CreateClient();

        var response = await client.GetAsync("/api/stylists");
        var raw = await response.Content.ReadAsStringAsync();

        await AssertEnvelope(response, HttpStatusCode.InternalServerError, "internal_error");

        Assert.DoesNotContain(FailingStylistCatalogue.SecretInTheMessage, raw);
        Assert.DoesNotContain("FailingStylistCatalogue", raw);

        // The other half of the bargain: suppressed in the body, kept in the log, or an
        // operator would have nothing at all to go on.
        Assert.Contains(FailingStylistCatalogue.SecretInTheMessage, logs.Text);
    }

    /// <summary>
    /// The shape itself: the four members RFC 9457 names, and the machine-readable code in the
    /// extensions that clients and tests match on instead of the prose.
    /// </summary>
    private static async Task<JsonElement> AssertEnvelope(
        HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);

        var body = await response.BodyAsync();

        Assert.Equal(JsonValueKind.String, body.GetProperty("type").ValueKind);
        Assert.Equal(JsonValueKind.String, body.GetProperty("title").ValueKind);
        Assert.Equal((int)status, body.GetProperty("status").GetInt32());
        Assert.Equal(code, body.GetProperty("code").GetString());

        return body;
    }
}
