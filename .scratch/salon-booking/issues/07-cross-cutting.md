# 07 - Error handling, API docs, README

Status: resolved
Type: task
Blocked by: 06

Spec: `../spec.md`

The cross-cutting layer and the things that make the repository readable to someone
arriving cold. The repository is the actual deliverable.

## Scope

**Errors.** One `IExceptionHandler`, registered with `AddProblemDetails`, turning every
failure into `ProblemDetails` (RFC 9457):

- `DomainException` carries its own status and machine-readable `code`, which goes into
  the `extensions` - `booking_overlap`, `cancellation_too_late` and the rest. Clients and
  tests match on the code, never on the prose.
- Model-binding and DataAnnotations failures already produce `ValidationProblemDetails`;
  confirm the shape is consistent with the handler's output rather than a second dialect.
- `401`, `403` and `404` return the same envelope.
- Anything unrecognised logs its detail server-side and returns a bare `500` with nothing
  internal in the body.

**API docs.** `Microsoft.AspNetCore.OpenApi` generates the document and is already
referenced; it ships no UI, since Swashbuckle left the template in .NET 9. Add Scalar for
the UI and wire JWT in so a reader can log in and exercise the endpoints from the browser.
Document response codes, including the `409`s.

**README.** Project description; prerequisites; `dotnet user-secrets` setup for
`Admin:Password` and the JWT key; `dotnet ef database update`; how to run; the endpoint
table; screenshots of Scalar. A pointer to `GLOSSARY.md` and `docs/adr/` - the ADRs are
where the interesting decisions are, and nobody will find them by accident.

## Done when

- Every status in `400, 401, 403, 404, 409, 500` returns the same JSON shape.
- No stack trace or connection string ever reaches a response body.
- Scalar loads, authorises with a pasted token, and a booking can be made through it.
- A clean clone can be run by following the README alone, with no undocumented steps.
