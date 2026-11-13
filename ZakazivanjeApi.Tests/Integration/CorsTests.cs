using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Net.Http.Headers;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// CORS through the real pipeline. The policy's own shape is covered by
/// <c>FrontendCorsTests</c>; what only this seam can prove is that the middleware is in the
/// pipeline at all, early enough that a preflight is answered rather than routed, and early
/// enough that a refusal is still a response the browser will hand over.
/// </summary>
[Collection(IntegrationCollection.Name)]
public class CorsTests(SalonApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>An origin the configuration says nothing about.</summary>
    private const string UnlistedOrigin = "https://salon.example";

    /// <summary>A request as a browser on <paramref name="origin"/> would send it.</summary>
    private static HttpRequestMessage CrossOrigin(HttpMethod method, string path, string origin)
    {
        var request = new HttpRequestMessage(method, path);

        request.Headers.Add(HeaderNames.Origin, origin);

        return request;
    }

    /// <summary>
    /// What the browser sends before the real request: the method it intends to use and, here,
    /// the one header it intends to set that preflight has to clear.
    /// </summary>
    private Task<HttpResponseMessage> PreflightAsync(string origin, string path = "/api/services")
    {
        var request = CrossOrigin(HttpMethod.Options, path, origin);

        request.Headers.Add(HeaderNames.AccessControlRequestMethod, "GET");
        request.Headers.Add(HeaderNames.AccessControlRequestHeaders, "authorization");

        return _client.SendAsync(request);
    }

    /// <summary>
    /// A response header as one string, or <c>null</c> when it was not sent at all — which for
    /// an <c>Access-Control-Allow-*</c> header is the whole answer to whether CORS allowed
    /// something.
    /// </summary>
    private static string? Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) ? string.Join(", ", values) : null;

    [Fact]
    public async Task Answers_a_preflight_from_a_configured_origin()
    {
        var response = await PreflightAsync(SalonApiFactory.AllowedOrigin);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(
            SalonApiFactory.AllowedOrigin,
            Header(response, HeaderNames.AccessControlAllowOrigin));
        Assert.Contains("GET", Header(response, HeaderNames.AccessControlAllowMethods));
        Assert.Contains(
            "Authorization",
            Header(response, HeaderNames.AccessControlAllowHeaders),
            StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The refusal is the absence of the header, on the preflight and on the request itself:
    /// there is nothing to stop a non-browser client sending whatever it likes, and the only
    /// thing CORS can do is decline to tell the browser the response may be read.
    /// </summary>
    [Fact]
    public async Task Does_not_allow_an_origin_the_configuration_does_not_name()
    {
        var preflight = await PreflightAsync(UnlistedOrigin);

        Assert.Null(Header(preflight, HeaderNames.AccessControlAllowOrigin));

        var response = await _client.SendAsync(
            CrossOrigin(HttpMethod.Get, "/api/services", UnlistedOrigin));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(Header(response, HeaderNames.AccessControlAllowOrigin));
    }

    /// <summary>
    /// The preflight and then the real request, on the route the frontend reads a client's own
    /// bookings from. This is what proves the bearer token both clears preflight and reaches
    /// the endpoint, rather than being dropped between the policy and the route.
    /// </summary>
    [Fact]
    public async Task Allows_an_authenticated_cross_origin_request()
    {
        var token = await _client.NewClientTokenAsync();

        var preflight = await PreflightAsync(SalonApiFactory.AllowedOrigin, "/api/bookings/my");

        Assert.Equal(HttpStatusCode.NoContent, preflight.StatusCode);
        Assert.Contains(
            "Authorization",
            Header(preflight, HeaderNames.AccessControlAllowHeaders),
            StringComparison.OrdinalIgnoreCase);

        var request = CrossOrigin(
            HttpMethod.Get, "/api/bookings/my", SalonApiFactory.AllowedOrigin);

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            SalonApiFactory.AllowedOrigin,
            Header(response, HeaderNames.AccessControlAllowOrigin));
    }

    /// <summary>
    /// A refusal needs the header as much as a success does. Without it the browser hands the
    /// frontend an opaque network error instead of the 401 the session handling is written
    /// against — which is why the policy is applied before authentication, not after.
    /// </summary>
    [Fact]
    public async Task Allows_the_origin_to_read_a_refusal()
    {
        var response = await _client.SendAsync(
            CrossOrigin(HttpMethod.Get, "/api/bookings/my", SalonApiFactory.AllowedOrigin));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(
            SalonApiFactory.AllowedOrigin,
            Header(response, HeaderNames.AccessControlAllowOrigin));
    }

    /// <summary>
    /// And a 500 the same, although the exception handler clears the response on its way to
    /// writing the envelope (ADR-0008). The headers are applied as the response starts rather
    /// than when the request arrives, so they survive that — asserted rather than assumed,
    /// because the frontend parses a ProblemDetails out of any non-2xx and cannot do that for
    /// a response the browser refuses to hand it.
    /// </summary>
    [Fact]
    public async Task Allows_the_origin_to_read_a_failure()
    {
        using var client = factory.WithFailingStylists(new CapturedLogs()).CreateClient();

        var response = await client.SendAsync(
            CrossOrigin(HttpMethod.Get, "/api/stylists", SalonApiFactory.AllowedOrigin));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(
            SalonApiFactory.AllowedOrigin,
            Header(response, HeaderNames.AccessControlAllowOrigin));
    }

    /// <summary>
    /// A deployment that allows no origin at all. The application has to start and serve as it
    /// always did — an empty list is "no cross-origin callers", not a malformed value — and it
    /// must not fall back to allowing everyone. The absent-section case is pinned by
    /// <c>FrontendCorsTests</c>, which can build a configuration that simply has no entry.
    /// </summary>
    [Fact]
    public async Task Starts_and_serves_when_no_origin_is_allowed()
    {
        using var client = factory
            .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(
                    new Dictionary<string, string?> { ["Cors:AllowedOrigins:0"] = "" })))
            .CreateClient();

        var response = await client.SendAsync(
            CrossOrigin(HttpMethod.Get, "/api/services", SalonApiFactory.AllowedOrigin));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(Header(response, HeaderNames.AccessControlAllowOrigin));
    }
}
