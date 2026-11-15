# The frontend is React and TypeScript, not Blazor WebAssembly

`web/` is a Vite application: React 19, TypeScript, TanStack Query, React Router, Tailwind.
It is deliberately outside `ZakazivanjeApi.sln` and shares no code with the API. The wire
contract reaches it as `src/api/schema.d.ts`, generated from the OpenAPI document by
`openapi-typescript` and committed.

The real alternative was Blazor WebAssembly, and it was not a weak one. A Blazor client could
have added a project reference to `ZakazivanjeApi` and used `Dtos/` directly: no generated
types, no regeneration step, and a wire contract checked by the compiler end to end, in one
language, with the DataAnnotations already on those DTOs validating the same way on both sides.
Every renaming of a field would have broken the build on the day it happened. That is a
stronger guarantee than anything available here.

Two things outweighed it. The first is the audience. This repository exists to be read, and a
React frontend is legible to roughly everybody who would open it, whereas Blazor is legible to
the subset of .NET developers who have used it — the same reason the API documents itself with
Scalar rather than assuming a reader will run it. The second is the client itself: the
specification is mobile-first, designed at 390px, on the premise that most of a salon's traffic
is someone on a phone, and Blazor WebAssembly answers a first visit by downloading a .NET
runtime. The slot grid — wrapping touch targets, stylist labels at that width, real keyboard
support — is ordinary work in the ecosystem that has been doing it for a decade.

## Consequences

**The contract is no longer compiler-checked across the boundary; it is checked at
regeneration.** `npm run generate:api` reads the document from a *running* API — it is mapped
in Development only — and rewrites `src/api/schema.d.ts`. Between regenerations the frontend
believes whatever that file last said. An API change that renames or retypes a field is not a
build failure on the day it is made; it is a build failure the next time somebody regenerates,
and a runtime surprise until then.

So the generated file is committed rather than built on demand, and it is the diff that makes a
wire change visible. Reviewing a regeneration is the substitute for the compiler, and it is a
weaker one.

What narrows the gap is a CI job rather than a convention: `.github/workflows/ci.yml` starts
the API against a SQL Server container, regenerates the types, and fails if the committed file
disagrees. A wire change made without regenerating is therefore caught on the push that makes
it, not whenever somebody next happens to run the command. It is still not the compiler — the
check runs after the fact rather than refusing to build, and it can only compare against the
document the API publishes — but the window it leaves is one push wide instead of unbounded.

The generated types are not used quite as generated: `scripts/narrow-schema.mjs` runs inside
the same npm script and rewrites two things the generator gets faithfully but unhelpfully —
`number | string` for every `int32`, and bare `string` for every wall-clock date (ADR-0011).
A codemod inside the generation step rather than a hand-written second set of types, so
regenerating cannot silently drop it; every rule must match at least once or it exits non-zero.

Two toolchains, two test runners, two sets of conventions, and a reader has to be fluent in
both halves. `dotnet test` and `npm run test` are separate commands and neither knows about the
other.

Validation is written twice. The API's DataAnnotations are the authority and the frontend's
client-side checks are a courtesy that keeps a form from making an obviously doomed request;
where they disagree, the API wins and the form renders what it was told (`auth/fieldErrors.ts`).
Blazor would have had one copy of those rules.
