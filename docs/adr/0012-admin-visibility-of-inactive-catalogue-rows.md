# One list route answers with the menu or the whole catalogue, by role

`GET /api/services` and `GET /api/stylists` take `includeInactive`. Left out or `false`, every
caller gets what they always got: the active rows — the **menu** of services, the stylists who
can be booked. Passed as `true` by an admin, the same route answers with the whole
**catalogue**, withdrawn rows included. Passed as `true` by anybody else, the request is
refused — `401` without a token, `403` with a client's.

This was one of exactly two API changes the frontend was allowed, and it exists because the API
genuinely could not express the admin's view of what the salon keeps. An admin could create a
service, withdraw it, and never see it again: there was no way to list inactive rows and
therefore no way to reach the id that `PUT /api/services/{id}` needs to put one back.
Withdrawing was a one-way door in an API whose whole position on deletion (ADR-0004) is that
nothing is ever destroyed and anything can be restored. The frontend did not want this for
convenience; without it `/admin/services` could not do the job the screen exists for.

The alternative was a second route — `GET /api/services/catalogue`, or an `/api/admin/...`
family — which is the tidier design on paper. One route, one audience, one answer, and
`[Authorize(Roles = "Admin")]` on the admin one doing the whole job declaratively instead of
the action deciding for itself.

It was rejected on duplication. The admin's list is the public list plus rows, over the same
projection, the same ordering and the same response type; a second route is a second copy of
all of that, and the two drift — the day somebody adds a field to `ServiceResponse`, the
catalogue route keeps the old shape until someone notices. What it costs to refuse it is
honestly stated: **one route now answers differently depending on who asks**, which is a thing
a reader has to be told rather than discover, and the role check has to live in the action
rather than in an attribute, because authorization is settled before the action runs and these
routes must stay open to anonymous callers for the list they answer with by default.

**The public default did not move**, and that was never in question. Making the full catalogue
the default and filtering for clients would have inverted the safe direction: a bug in a role
check would then publish withdrawn services to everyone, rather than denying an admin a list
they can ask for again. A client also has no use for a service they cannot book — it is not
secret, it is noise, and the menu is a smaller promise to keep.

## Consequences

Asking to widen without the role is **refused, not quietly narrowed**. A `200` carrying the
menu would hide two real situations behind a success: an admin screen holding a session that
is no longer an admin's, and a caller that misread the contract. It is the same position the
booking list takes on `page=0` — the API does not answer a narrower question than the one it
was asked. Passing `false` asks for what everyone already gets and is refused to nobody.

A `401` for a caller the API cannot identify and a `403` for one it can, which is the division
every admin route already makes. The `401` is the honest answer rather than a `403` for
everyone, because retrying with an administrator's token really does work. Both come from
`Challenge()` and `Forbid()` rather than hand-built results, so they leave the application
exactly as the pipeline's own do: the bearer scheme's `WWW-Authenticate` header on the `401`,
and the one `ProblemDetails` envelope on both (ADR-0008).

The decision lives in one place, `CatalogueScope.RefusalToWiden`, extending `ControllerBase`
and called first in both actions — so the two routes cannot drift into refusing the same caller
on different terms, which is the failure mode of a rule written twice.

The flag is documented with a `[Description]` attribute, not only the XML comment above the
action. This project generates no documentation file, so an XML comment reaches a reader of the
source and nobody else — not the OpenAPI document, and not the TypeScript types generated from
it (ADR-0009). Verified against the running application both ways.

This is a deviation from the source specification, which has the two list routes answering with
active rows and nothing else. It is recorded here because a reader comparing the two will find
it, and the honest account is that the specification described an API in which withdrawal could
not be undone.

Named for *scope* rather than visibility, and the glossary is why: `GLOSSARY.md` rules
"visible" out around **Active**, because what has been withdrawn is not hidden. It is still in
the catalogue, still on every booking taken against it, and still readable by id —
`GET /api/services/{id}` resolves a withdrawn service to anybody, which is what lets a client's
own old booking still render the service it was taken against.
