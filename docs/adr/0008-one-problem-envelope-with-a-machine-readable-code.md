# Every failure answers in one ProblemDetails envelope carrying a machine-readable code

Every status the API refuses with — `400`, `401`, `403`, `404`, `409`, `500` — comes back as
`ProblemDetails` (RFC 9457) with a `code` in the extensions: `booking_overlap`,
`cancellation_too_late`, `email_taken`, `unauthorized`, `not_found`. Clients and tests branch
on `code`. The `title` and `detail` are prose for a human and carry no contract at all.

Left alone, an ASP.NET Core API answers in three dialects at once. A `DomainException` goes
through the exception handler and becomes `ProblemDetails`. A DataAnnotations failure goes
through the `[ApiController]` convention and becomes `ValidationProblemDetails`. A `401` from
authentication, a `403` from a role and a `404` from routing go through neither and become an
empty body with a bare status line. A client then needs three code paths to find out what went
wrong, and the one it gets for free — the empty body — tells it nothing.

Two pieces close that. `CustomizeProblemDetails` stamps a code on anything that reaches
`IProblemDetailsService` without one, which covers the exception handler and the validation
convention both. `UseStatusCodePages` gives the statuses that never reach a handler a body to
be stamped. What arrives on the wire is one shape, and `code` is always in it.

The codes are *specific where a layer knows better and generic where it does not*. A rule
names its own — `booking_overlap`, not `conflict` — because that is the whole value of the
field. A `404` from routing has nothing more to say than `not_found`.

## Consequences

`code` is as much a part of the published contract as the routes are, so renaming one is a
breaking change. That is the point: it is the field clients are told to depend on, and prose
they might otherwise have matched on is now explicitly theirs to ignore.

The generator cannot see into `Extensions`, so `code` would have been the one field documented
nowhere. A schema transformer adds it to the `ProblemDetails` and `ValidationProblemDetails`
schemas by hand; it will not follow a rename on its own.

An unhandled exception is the exception to the uniformity of `detail`: its message is dropped
from the body, because it is the one string that could name a table, a path or a connection
string. It is logged server-side first, so the refusal is still explicable to whoever operates
the thing — just not to whoever is calling it.

`ValidationProblemDetails` stays a superset rather than being flattened into the common shape:
a `400` carries `errors` with a field-by-field account on top of the envelope. Collapsing that
into one `detail` string would lose the only part of it a form can act on.
