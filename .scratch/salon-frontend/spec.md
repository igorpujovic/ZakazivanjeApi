# Salon Booking Web

The browser frontend for the Salon Booking API. Clients browse the menu, pick a time and book
or cancel; admins manage the catalogue and every booking. One application serves both, on
different terms.

Source: the design session of 2026-11-13. This file is the companion to
`../salon-booking/spec.md`, which specifies the API it consumes. Where the two disagree about
the API, that file wins.

Stack: React, TypeScript, Vite, TanStack Query, React Router, Tailwind v4, Radix (Dialog and
Select only), Vitest, React Testing Library, MSW. Lives at `web/` in this repository,
deliberately outside `ZakazivanjeApi.sln`.

Audience: a portfolio showpiece held to the same standard as the API. Decisions are written
down, and nothing a reader would wonder about is left unexplained.

## Vocabulary

See the repository's `GLOSSARY.md`. The frontend introduces no domain terms of its own and
must not invent any. Note in particular:

- **Catalogue** and **Menu** are different. The catalogue is services *and* stylists, active or
  not, as an admin curates them. The menu is the active services a client may choose from. The
  admin navigation says Catalogue; the client landing page is the Menu.
- A **Slot** is an offer, not a hold. Nothing is reserved until a booking is made, so losing a
  slot to another client is normal operation, not an error state.
- Deactivating **withdraws** something from the menu. The UI never says "delete", even where
  the route is `DELETE`.

## Shape

One application, one login, a role-aware shell. `AuthResponse` carries `user.role`, so the
frontend never decodes the JWT to decide what to render.

| Route             | Access | Purpose                                              |
| ----------------- | ------ | ---------------------------------------------------- |
| `/`               | Public | The menu. The landing page.                          |
| `/book`           | Client | Pick service, stylist, day and slot; confirm.        |
| `/bookings`       | Client | Own bookings; cancel.                                |
| `/login`          | Public | Sign in.                                             |
| `/register`       | Public | Open an account; chains into sign-in.                |
| `/admin/bookings` | Admin  | Every booking, by day and stylist; cancel, complete. |
| `/admin/services` | Admin  | Services, active and inactive.                       |
| `/admin/stylists` | Admin  | Stylists, active and inactive.                       |

`/admin/*` is gated on `role === "Admin"`. There is no team page and no service detail page:
`StylistResponse` is `{ id, name, isActive }` and `ServiceResponse` has no description, so both
would show exactly what the lists already show. `GET /api/services/{id}` is used instead by the
admin edit panel, being the only route that returns an inactive service by id.

## How it runs

Two processes in development: `dotnet run --project ZakazivanjeApi` and `npm run dev` in `web/`,
with the Vite dev server proxying `/api` to `http://localhost:5056`. The proxy makes every
request same-origin, so CORS is not exercised in development — it is added anyway so the API is
honestly consumable from a browser on another origin, rather than only working behind a proxy
that hides the problem.

No deployment. The README documents the two commands.

## The API contract

Types are generated from `/openapi/v1.json` with `openapi-typescript` and committed. That
document is mapped in Development only, so generation is a dev-time step against a running
application and the committed output is what the build uses. Regenerating is a documented
command, not a build step.

Generation is followed by a codemod, `scripts/narrow-schema.mjs`, run inside the same
`generate:api` script. It exists because .NET 11 emits `"type": ["integer", "string"]` with a
numeric `pattern` for every `int32` and `double`, so the generator faithfully produces
`id: number | string` — which in practice never happens, `System.Text.Json` always writing a
number, but which as typed would mean `Number(...)` at every use of every id and price. The
codemod collapses those to `number` and swaps the branded wall-clock types in for `date-time`
and `date`. Every rule must match at least once or it exits non-zero: a codemod that silently
stops applying would put the types quietly back to being wrong. One rule is an exact line match
rather than comment-driven, because the generator drops `items.format` and
`AvailableSlotsResponse.slots` therefore arrives as a bare `string[]`.

Over the generated types sits one hand-written wrapper. It attaches
`Authorization: Bearer <token>`, parses `ProblemDetails` on any non-2xx, and throws a typed
error carrying `code`, `detail`, `status` and — for a `400` — `errors`. Call sites are
hand-written: how refusals are handled and how caches are invalidated is the work worth
showing, and a generated client would hide exactly that.

`ProblemDetails.code` does reach the generated types as `code?: string`, with its "branch on
this, never on the prose" description attached — the API adds it to the schema through a
transformer. What the document cannot say is *which* codes exist, so a narrow union covers only
the ones the UI has distinct copy for:

```ts
type HandledErrorCode =
  | "booking_overlap"
  | "booking_contended"
  | "start_in_past"
  | "stylist_inactive"
  | "service_inactive"
  | "cancellation_too_late"
  | "invalid_credentials"
  | "email_taken";
```

The raw `code: string` sits beside it. Switches over the union are exhaustive with a `default`
that renders `detail` — which is what the API's README promises `detail` is for, and means a
code the API grows later degrades gracefully instead of breaking a build. There is no committed
list of every code and no completeness test: the codes are not centralised in C# (some are
static members on `BookingRuleResult`, some inline literals in `BookingService`, some in
controllers, and anything unlisted is derived as `http_<status>`), so such a test could not be
honest without an API refactor that is out of scope.

## Time

ADR-0001 makes every API time local salon wall-clock with `Kind.Unspecified`, so the wire
carries `"2026-11-20T09:30:00"` with no `Z` and no offset. JavaScript is the worst possible
consumer of that string: `new Date("2026-11-20T09:30:00")` parses as browser-local, which
renders correctly in Belgrade and silently wrong in London, and `.toISOString()` converts to
UTC, so a value round-tripped through a `Date` posts back an hour off. These are the exact bugs
ADR-0001 exists to prevent on the server, reintroduced on the client.

All date handling goes through one module, `wallClock.ts`:

- A branded `WallClockString` type. The generated types are narrowed so `start`, `end` and
  `date` positions take the brand, and a raw string cannot reach one without passing through
  the module.
- `parse` builds a `Date` from explicit components — `new Date(y, m - 1, d, h, min)` — never
  from the string. The result is a local `Date` whose wall-clock components match the salon's,
  so `Intl` renders it correctly in any browser timezone.
- `format` goes through `Intl.DateTimeFormat` / `Intl.NumberFormat` with the `sr-RS` locale.
- `toWallClockString` serialises back from components for anything sent to the API.

`toISOString` and `toJSON` are banned in `src/`. Not by a lint rule: the Vite scaffold ships
**oxlint**, which does not implement `no-restricted-syntax`, and adding ESLint alongside it to
express one rule is a poor trade. The ban is a test instead — `src/lib/noConversions.test.ts`
scans the source tree with comments stripped, so `wallClock.ts` can keep explaining the trap at
length while a real call anywhere fails the suite. It was verified against a planted violation.
See ADR-0011.

## Session and auth

The session — `{ accessToken, expiresAt, user }` — is held in `sessionStorage`. It survives a
refresh and dies with the tab, which matches how long a 60-minute token with no refresh is
useful; `localStorage` would leave the credential on disk past the user's intent for a
durability gain that the 60-minute expiry makes small. On startup the stored session is parsed
and discarded if `expiresAt` has passed, so the app never sends a token it already knows is
dead. One timer warns at five minutes remaining and clears the session at expiry. Any `401`
from the wrapper clears the session and redirects to `/login?returnTo=<path>`.

This is how ADR-0006's "no refresh tokens" is absorbed rather than reversed. See ADR-0010.

`POST /api/auth/register` answers `201` with a `UserResponse` and no token, so registering does
not sign you in. The register form chains the two calls: register, then login with the same
credentials already in memory, then land the user at `returnTo`. If register succeeds and login
fails, fall back to `/login` with the email prefilled and an explicit message that the account
was created.

## The booking page

`GET /api/stylists/{id}/available-slots` needs stylist, date *and* service before it can answer
anything, and answers for one stylist on one day. There is no multi-day endpoint, so there is
no month-availability calendar: faking one would cost about thirty requests per stylist.

One page, state in the URL as `/book?serviceId=3&stylistId=1&date=2026-11-20`, so a choice is
linkable and the back button is free. Three controls, then the slot grid once all three are set.
The date input is native with `min` set to today.

The stylist control defaults to **No preference**, which the API cannot express. The frontend
closes that gap itself: one `available-slots` call per active stylist for that date, in
parallel, merged into one grid with each slot labelled by who is free. Picking a named stylist
collapses to a single call. This is the one place the frontend compensates for the API's shape
rather than asking the API to change.

The grid carries one line saying a time is not held until confirmed, so losing a race is
explicable rather than surprising.

### When confirming fails

Five codes, five recoveries, because they call for genuinely different actions:

| Code                 | Means                                  | Recovery                                                          |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `booking_overlap`    | Someone took it. Retrying is futile.   | Refetch slots; the time disappears. Inline message, choices kept. |
| `booking_contended`  | Deadlock race, nothing written.        | Retry button — the API's own `detail` asks for exactly this.      |
| `start_in_past`      | They sat on the page too long.         | Refetch; stale slots drop out on their own.                       |
| `stylist_inactive`   | An admin retired the stylist mid-flow. | Refetch the catalogue, say what is no longer on offer.            |
| `service_inactive`   | Likewise the service.                  | As above.                                                         |

No pre-check before posting. Refetching to confirm a slot is still free narrows the race window,
guarantees nothing, and treats a slot as reservable — which is the misconception the glossary
exists to kill.

On success, invalidate both the slots query and `bookings/my`.

## Admin

### Bookings

`GET /api/bookings` orders by `Start` then `Id` ascending, so calling it bare puts the oldest
bookings in salon history on page one. The page therefore defaults to `date=today`, with the day
in the URL, prev/next day buttons and a stylist dropdown. A "clear date" escape hatch exists and
is labelled as the whole-history view, so nobody mistakes it for a broken default.

There is no `status` filter on the endpoint and none is faked client-side: dropping cancelled
rows from a page of twenty would make "20 of 143" a lie and break the `Start`-then-`Id`
pagination the API spec argues for. Status is a badge per row, and a day's cancelled bookings
are arguably what a receptionist most needs to see — a freed slot.

Cancel is per row with a confirmation, since an admin cancelling someone else's booking has no
undo. Complete is **disabled until `Start` has passed**, with a tooltip saying why, so the UI
never sends a request it knows returns `booking_not_started`.

`BookingResponse` already carries `clientId` and `clientName`, so the table needs no second
call to say who booked.

### Catalogue

One table per screen, a "Show inactive" checkbox driving `?includeInactive=true`, inactive rows
dimmed with a badge. Activation is an inline toggle: it is one boolean and burying it in a form
helps nobody. Switching it **off** confirms, in glossary wording — it disappears from the menu
and existing bookings keep it, not "this cannot be undone", because reactivation makes it very
much undoable. Switching it **on** does not confirm; reactivating is harmless.

Create and edit open a side panel, not a route, so the eight routes stay eight and the list
stays visible behind it. The edit panel carries one line: changes do not affect bookings already
made. That sentence is ADR-0003 made visible to the only person who would ever worry about it.

## Validation

Native constraints on the inputs — `required`, `type="email"`, `maxLength`, `min`, `max` — with
the bounds in one small `limits.ts` commented as mirroring `CatalogueLimits.cs`: name 1–200
trimmed, duration 1–1440, price 0–99999999.99, register name 2–200, email ≤256, password 8–128.
No zod: the API's DataAnnotations are a working, tested validator, and a second one in another
language would drift silently.

The server's `errors` map onto form fields as the backstop, for anything the browser cannot know
— `email_taken`, the trimming rule. **The casing of those keys is to be verified against a
running instance before the mapping is written, not assumed**: DataAnnotations produce `Name`
and `DurationMinutes`, which may arrive PascalCase or as `$.name` paths depending on the JSON
options.

The authoritative numbers do reach the generated OpenAPI JSON as `maxLength` / `minimum` /
`maximum`; `openapi-typescript` drops them when emitting types, so if the duplication ever
bothers us there is a path to deriving them.

## Styling and responsiveness

Tailwind v4. Radix for **Dialog and Select only**, copied in shadcn-style into the repository
rather than imported wholesale, because those two are where focus trapping, focus restore,
`Escape` handling and ARIA are easy to get wrong, and hand-rolled modals are where
accessibility quietly breaks. Six hand-built primitives — Button, Field, Table, Badge,
SlotGrid, EmptyState — enough to read as a system rather than a pile of utility classes. A
salon palette as CSS custom properties.

No component library: a reviewer recognises MUI instantly and the visual credit transfers to
MUI. No dark mode: a salon's booking page has no business following the OS theme, and half-done
dark mode looks worse than none.

Mobile-first on the client side, designed at 390px and scaled up — most of a salon's traffic is
someone on a phone, and the menu is the first thing a reviewer opens. Desktop-first on the admin
side, designed at 1280px and held usable down to tablet, with no phone layout attempted: the
bookings table is seven columns plus two actions, and a receptionist uses a keyboard. Admin
tables get `overflow-x: auto` and nothing more; an honest horizontal scroll beats a card layout
pretending a table was a mistake. The split is stated in the README rather than left to be
discovered.

The slot grid earns the mobile effort: wrapping tap targets at a real touch size, stylist labels
legible at that width, and real keyboard support. It is the one novel widget in the application.

## Testing

ADR-0007 made the booking rules dependency-free so they could be tested without a database. The
frontend's equivalent is that its interesting logic is pure, so:

- **Vitest on the pure modules.** `wallClock` round-trips — parse, format, serialise, assert the
  string is unchanged — run under a forced non-Belgrade `TZ`, because a timezone test that
  passes only because the developer's machine agrees with the server is worse than no test.
  Plus the fan-out merge and the error-code mapping.
- **React Testing Library with MSW on two screens**: the booking page and the admin bookings
  table. This is where the race recovery is proven — MSW answers `booking_overlap`, the test
  asserts the grid refetches and the slot is gone. MSW handlers are built from the generated
  types, so a mock cannot drift from the contract either.
- **No Playwright.** It needs LocalDB, a running API, a seeded admin and a CI story this
  repository does not have, and a flaky end-to-end suite in a portfolio repository is worse than
  none.

## API changes

Two, and only two. Both are prerequisites, tracked as issues 01 and 02 here rather than in
`../salon-booking/` because they exist only to serve the frontend, which keeps `Blocked by`
intra-directory as `docs/agents/issue-tracker.md` assumes.

1. **CORS.** A named policy whose allowed origins come from configuration, defaulted in
   `appsettings.Development.json` to the Vite origin.
2. **Admin visibility of inactive catalogue rows.** `?includeInactive=true`, admin-only, on
   `GET /api/services` and `GET /api/stylists`, and `IsActive` on `PUT /api/services/{id}`.
   Without it an admin can create a service, deactivate it, and never see or recover it again:
   there is no `includeInactive` today and no route that sets a service active. The API
   genuinely cannot express the admin's view of the catalogue. See ADR-0012.

Explicitly **not** changing: refresh tokens, `GET /api/bookings/{id}`, an admin client list, a
token on register, a centralised `ErrorCodes` class in C#. The first three are in the API spec's
"out of scope, deliberately" and ADR-0006's reasoning still holds; a frontend wanting
convenience is not grounds to reverse it.

## ADRs

Four, written in issue 09 once the thing exists, so they describe what was built:

- **0009** React over Blazor WebAssembly. Blazor could have referenced `Dtos/` directly, making
  the wire contract compiler-checked end to end. We declined, and a .NET reader will want to
  know why.
- **0010** The bearer token in `sessionStorage`, over an `httpOnly` cookie that was not ours to
  choose.
- **0011** Client-side wall-clock handling. The companion to ADR-0001: what the server's
  decision costs a JavaScript client, and how it was paid.
- **0012** Admin visibility of inactive catalogue rows.

Not ADRs: English-only (reversible, a README line) and Tailwind with Radix (reversible,
unsurprising, no real trade-off).

## Out of scope, deliberately

Blazor and shared DTO types. A live deployment. Refresh tokens. A month-availability calendar —
the API cannot support one. Internationalisation; the UI is English-only with `sr-RS` formatting
for dates and RSD. A component library. Dark mode. Playwright. A team page or service detail
pages. Serving the built SPA from `wwwroot`. Notifications of any kind.
