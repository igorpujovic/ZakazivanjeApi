using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace ZakazivanjeApi.Services;

/// <summary>
/// What the document calls the API. Named for the salon rather than for the assembly, since this
/// heading is the first thing a reader meets.
/// </summary>
public sealed class DocumentInfoTransformer : IOpenApiDocumentTransformer
{
    /// <summary>Shared with Scalar, which puts it in the browser's title bar.</summary>
    public const string Title = "Salon Booking API";

    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        document.Info.Title = Title;
        document.Info.Description =
            "Appointments for a single hair salon. Clients browse services and stylists, see "
            + "available times and book or cancel; admins manage the catalogue and every "
            + "booking.\n\n"
            + "Every failure answers in ProblemDetails (RFC 9457) with a machine-readable "
            + "`code` — branch on that, never on the prose. The vocabulary is in GLOSSARY.md "
            + "and the decisions behind it in docs/adr/.";

        return Task.CompletedTask;
    }
}

/// <summary>
/// Teaches the OpenAPI document that this API is opened with a bearer token, which is what puts
/// the authentication box in Scalar and lets a reader exercise the protected endpoints from the
/// browser instead of reaching for curl.
/// </summary>
public sealed class BearerSecurityTransformer : IOpenApiDocumentTransformer
{
    public const string SchemeName = JwtBearerDefaults.AuthenticationScheme;

    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

        document.Components.SecuritySchemes[SchemeName] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "Paste the accessToken from POST /api/auth/login. Tokens last 60 minutes; "
                + "there are no refresh tokens, so log in again when one expires.",
        };

        return Task.CompletedTask;
    }
}

/// <summary>
/// Marks the operations that actually need the token, so the reader can tell at a glance which
/// endpoints are public. Declaring it on the document instead would hang a padlock on
/// registration, login and the whole public catalogue, which is worse than saying nothing.
/// </summary>
public sealed class BearerRequirementTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        var metadata = context.Description.ActionDescriptor.EndpointMetadata;

        var needsToken = metadata.OfType<IAuthorizeData>().Any()
            && !metadata.OfType<IAllowAnonymous>().Any();

        if (needsToken)
        {
            operation.Security =
            [
                new OpenApiSecurityRequirement
                {
                    [new OpenApiSecuritySchemeReference(
                        BearerSecurityTransformer.SchemeName, context.Document)] = [],
                },
            ];
        }

        return Task.CompletedTask;
    }
}

/// <summary>
/// Gives every operation the <c>500</c> it can always answer with.
/// </summary>
/// <remarks>
/// Sixteen actions can all fail unforeseeably, and declaring that sixteen times on the
/// controllers would be noise that falls out of step the first time someone forgets it. The
/// statuses that depend on the route — the 403s, the 404s, the 409s and their codes — stay on
/// the actions, where a reader looking at one endpoint can see what it refuses and why.
/// </remarks>
public sealed class ServerErrorResponseTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        operation.Responses ??= new OpenApiResponses();

        operation.Responses[$"{StatusCodes.Status500InternalServerError}"] = new OpenApiResponse
        {
            Description = "Something unforeseen. Logged server-side; the body says nothing more "
                + "than code: internal_error.",
            Content = new Dictionary<string, IOpenApiMediaType>
            {
                ["application/problem+json"] = new OpenApiMediaType
                {
                    Schema = new OpenApiSchemaReference(nameof(ProblemDetails), context.Document),
                },
            },
        };

        return Task.CompletedTask;
    }
}

/// <summary>
/// Puts <c>code</c> in the documented shape of a problem response. It reaches the wire through
/// <c>Extensions</c>, which the generator cannot see into, so without this the one field a
/// client is meant to branch on would be the one field the document never mentions.
/// </summary>
public sealed class ProblemCodeSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(
        OpenApiSchema schema,
        OpenApiSchemaTransformerContext context,
        CancellationToken cancellationToken)
    {
        if (context.JsonTypeInfo.Type == typeof(ProblemDetails)
            || context.JsonTypeInfo.Type == typeof(ValidationProblemDetails))
        {
            schema.Properties ??= new Dictionary<string, IOpenApiSchema>();
            schema.Properties["code"] = new OpenApiSchema
            {
                Type = JsonSchemaType.String,
                Description =
                    "Machine-readable reason, in lower snake case — booking_overlap, "
                    + "email_taken, cancellation_too_late. Branch on this, never on the prose.",
            };
        }

        return Task.CompletedTask;
    }
}
