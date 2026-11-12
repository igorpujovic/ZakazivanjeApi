namespace ZakazivanjeApi.Domain;

/// <summary>
/// A request that was understood and refused by a business rule, carrying the status it should
/// become and a machine-readable code. One handler turns these into <c>ProblemDetails</c>, so
/// this is the single place where a domain failure becomes HTTP (ADR-0007). Clients and tests
/// match on <see cref="Code"/>, never on the prose.
/// </summary>
public class DomainException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    /// <summary>Lower snake case, e.g. <c>email_taken</c>. Part of the API's contract.</summary>
    public string Code { get; } = code;

    /// <summary>The request is well-formed but the current state forbids it.</summary>
    public static DomainException Conflict(string code, string message) =>
        new(StatusCodes.Status409Conflict, code, message);

    /// <summary>Nothing here answers to that identifier.</summary>
    public static DomainException NotFound(string code, string message) =>
        new(StatusCodes.Status404NotFound, code, message);

    /// <summary>The caller has not proved who they are, or proved it wrongly.</summary>
    public static DomainException Unauthorized(string code, string message) =>
        new(StatusCodes.Status401Unauthorized, code, message);
}
