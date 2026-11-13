using Microsoft.AspNetCore.Mvc;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Makes every refusal the API answers with look the same, whichever layer refused it.
/// </summary>
/// <remarks>
/// A <see cref="ZakazivanjeApi.Domain.DomainException"/> names its own code; the statuses the
/// framework produces on its own — a 401 from authentication, a 403 from a role, a 404 from
/// routing, a 500 from something unforeseen — name nothing, and would otherwise reach the wire
/// as an empty body. Stamping a code on those too means a client never has to tell two dialects
/// apart: it reads <c>code</c>, always, and the prose is only ever for a human (ADR-0008).
/// </remarks>
public static class ProblemEnvelope
{
    /// <summary>
    /// The code for a status nothing more specific has claimed. Part of the API's contract, so
    /// these strings are as fixed as the domain's own codes.
    /// </summary>
    private static readonly Dictionary<int, string> CodesByStatus = new()
    {
        [StatusCodes.Status400BadRequest] = "invalid_request",
        [StatusCodes.Status401Unauthorized] = "unauthorized",
        [StatusCodes.Status403Forbidden] = "forbidden",
        [StatusCodes.Status404NotFound] = "not_found",
        [StatusCodes.Status405MethodNotAllowed] = "method_not_allowed",
        [StatusCodes.Status415UnsupportedMediaType] = "unsupported_media_type",
        [StatusCodes.Status500InternalServerError] = "internal_error",
    };

    // No entry for 409. Every conflict this API answers with comes from a rule, which names
    // itself — booking_overlap, cancellation_too_late — and a generic "conflict" could only ever
    // shadow one of those. The glossary rules the word out for that reason.

    /// <summary>
    /// Derived rather than absent for anything unlisted, because a client that branches on
    /// <c>code</c> should never meet a response that hasn't got one.
    /// </summary>
    private static string CodeFor(int status) =>
        CodesByStatus.TryGetValue(status, out var code) ? code : $"http_{status}";

    /// <summary>
    /// Fills in what a bare status code leaves out. Runs for everything that goes through
    /// <c>IProblemDetailsService</c>: the exception handler, the status code pages, and the
    /// <c>[ApiController]</c> convention that turns a DataAnnotations failure into a 400.
    /// </summary>
    public static void Customize(ProblemDetailsContext context)
    {
        // Only when nothing has claimed one. The domain handler sets its own code first, and a
        // rule's code is the specific answer — booking_overlap, not conflict.
        if (!context.ProblemDetails.Extensions.ContainsKey("code"))
        {
            context.ProblemDetails.Extensions["code"] =
                CodeFor(context.ProblemDetails.Status ?? context.HttpContext.Response.StatusCode);
        }

        // An unhandled exception's own message is the one string here that could name a table, a
        // path or a connection string, and it has already been logged server-side by the time
        // this runs. A refused rule's message is written to be read by a client and stays.
        if (context.Exception is not null and not Domain.DomainException)
        {
            context.ProblemDetails.Detail = null;
        }
    }
}
