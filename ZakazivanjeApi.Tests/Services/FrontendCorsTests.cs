using System.Text;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Tests.Services;

/// <summary>
/// The CORS policy as configuration hands it over. Worth testing here rather than only over
/// HTTP: the things most easily got wrong — a blanket any-origin, credentials switched on, an
/// absent section throwing — are properties of the policy itself, and this seam can state them
/// without a database.
/// </summary>
public class FrontendCorsTests
{
    /// <summary>
    /// The policy the API would register, given <paramref name="json"/> as its configuration.
    /// Built through the same extension method <c>Program</c> calls, so a test cannot assert
    /// against a policy assembled on different terms than the one that ships.
    /// </summary>
    private static CorsPolicy Policy(string json)
    {
        var configuration = new ConfigurationBuilder()
            .AddJsonStream(new MemoryStream(Encoding.UTF8.GetBytes(json)))
            .Build();

        var policy = new ServiceCollection()
            .AddSingleton<IConfiguration>(configuration)
            .AddFrontendCors()
            .BuildServiceProvider()
            .GetRequiredService<IOptions<CorsOptions>>()
            .Value
            .GetPolicy(FrontendCors.PolicyName);

        Assert.NotNull(policy);

        return policy;
    }

    private const string TwoOrigins = """
        {
          "Cors": {
            "AllowedOrigins": ["http://localhost:5173", "https://salon.rs"]
          }
        }
        """;

    [Fact]
    public void Allows_the_configured_origins_and_only_those()
    {
        var policy = Policy(TwoOrigins);

        Assert.Equal(["http://localhost:5173", "https://salon.rs"], policy.Origins);
        Assert.False(policy.AllowAnyOrigin);
    }

    /// <summary>
    /// The four methods the frontend sends and nothing else. Named rather than
    /// <c>AllowAnyMethod</c>, so the policy cannot come to permit more than the application
    /// has routes for.
    /// </summary>
    [Fact]
    public void Allows_the_methods_the_frontend_sends_and_only_those()
    {
        var policy = Policy(TwoOrigins);

        Assert.Equal(["GET", "POST", "PUT", "DELETE"], policy.Methods);
        Assert.False(policy.AllowAnyMethod);
    }

    /// <summary>
    /// The session is a bearer token in a header, so <c>Authorization</c> has to survive
    /// preflight; everything this API reads a body for is JSON, so <c>Content-Type</c> does
    /// too. Nothing else is asked for.
    /// </summary>
    [Fact]
    public void Allows_the_headers_the_frontend_sends_and_only_those()
    {
        var policy = Policy(TwoOrigins);

        Assert.Equal(["Authorization", "Content-Type"], policy.Headers);
        Assert.False(policy.AllowAnyHeader);
    }

    /// <summary>
    /// No credentials. The session is a bearer token, not a cookie, so there is nothing for the
    /// browser to attach, and asking for them would forbid a wildcard origin for nothing.
    /// </summary>
    [Fact]
    public void Does_not_support_credentials()
    {
        Assert.False(Policy(TwoOrigins).SupportsCredentials);
    }

    /// <summary>
    /// No section at all. A deployment with no browser frontend in front of it is an ordinary
    /// one, so this has to be an empty allow-list and not a startup failure — and emphatically
    /// not the any-origin policy an unconfigured default could so easily become.
    /// </summary>
    [Fact]
    public void Allows_nothing_when_no_origins_are_configured()
    {
        var policy = Policy("{}");

        Assert.Empty(policy.Origins);
        Assert.False(policy.AllowAnyOrigin);
    }
}
