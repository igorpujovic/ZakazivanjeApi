using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Domain;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Renders a refused business rule as <c>ProblemDetails</c> (RFC 9457), with its
/// machine-readable code in the extensions — the one place a <see cref="DomainException"/>
/// becomes HTTP (ADR-0007). Anything that is not one is passed on untouched.
/// </summary>
public class DomainExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not DomainException domainException)
        {
            return false;
        }

        httpContext.Response.StatusCode = domainException.StatusCode;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = domainException,
            ProblemDetails = new ProblemDetails
            {
                Status = domainException.StatusCode,
                Detail = domainException.Message,
                Extensions = { ["code"] = domainException.Code },
            },
        });
    }
}
