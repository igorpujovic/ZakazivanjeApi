using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Which browser origins may call this API, bound from the <c>Cors</c> configuration section.
/// </summary>
/// <remarks>
/// Not validated at startup, unlike working hours (ADR-0002): an empty or absent list is a
/// valid configuration meaning "no cross-origin callers", not a malformed value, and an API
/// nobody calls from another origin is an ordinary deployment.
/// </remarks>
public class CorsOriginsOptions
{
    public const string SectionName = "Cors";

    /// <summary>
    /// Each entry is a scheme, host and port with no trailing slash — <c>http://localhost:5173</c> —
    /// because that is the form a browser sends in the <c>Origin</c> header and the policy
    /// compares against it exactly.
    /// </summary>
    public string[] AllowedOrigins { get; set; } = [];
}

/// <summary>
/// The one CORS policy this API has: the browser frontend, calling from its own origin.
/// Development never exercises it, because the Vite dev server proxies <c>/api</c> and makes
/// every request same-origin — but an API that only works from behind that proxy is not
/// honestly consumable from a browser, and the proxy hides that rather than solving it.
/// </summary>
public static class FrontendCors
{
    /// <summary>The policy name, written once here and used by both ends of the wiring.</summary>
    public const string PolicyName = "Frontend";

    /// <summary>
    /// The methods the frontend actually sends, rather than <c>AllowAnyMethod</c>. The API has
    /// no route on any other verb, so naming them costs nothing and keeps the preflight
    /// response an accurate description of the application.
    /// </summary>
    private static readonly string[] Methods =
        [HttpMethods.Get, HttpMethods.Post, HttpMethods.Put, HttpMethods.Delete];

    /// <summary>
    /// The two request headers the frontend sets: the bearer token the session is carried in,
    /// and the content type of a JSON body. Everything else a browser sends of its own accord
    /// is a CORS-safelisted header and needs no permission.
    /// </summary>
    private static readonly string[] Headers =
        [HeaderNames.Authorization, HeaderNames.ContentType];

    /// <summary>
    /// Registers the policy over the configured origins. Credentials are deliberately not
    /// supported: the session is a bearer token in a header, not a cookie, so there is nothing
    /// for the browser to attach, and asking for them would forbid a wildcard origin for
    /// nothing.
    /// </summary>
    public static IServiceCollection AddFrontendCors(this IServiceCollection services)
    {
        services.AddCors();

        // Bound by section name rather than from a configuration instance captured here, so
        // the origins are read from the configuration the host finally has. That is this
        // repository's habit for JWT and working hours, and it is also what lets a test host
        // supply origins of its own.
        services
            .AddOptions<CorsOriginsOptions>()
            .BindConfiguration(CorsOriginsOptions.SectionName);

        services
            .AddOptions<CorsOptions>()
            .Configure<IOptions<CorsOriginsOptions>>((cors, origins) => cors.AddPolicy(
                PolicyName,
                policy => policy
                    .WithOrigins(origins.Value.AllowedOrigins)
                    .WithMethods(Methods)
                    .WithHeaders(Headers)));

        return services;
    }
}
