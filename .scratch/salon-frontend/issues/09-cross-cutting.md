# 09 - Cross-cutting: tests, four ADRs, README

Status: resolved
Type: task
Blocked by: 04, 05, 06, 07, 08

Spec: `../spec.md`

What makes this a portfolio piece rather than a working application. The ADRs are written here,
last, so they describe what was actually built instead of what was intended.

## Scope

- **React Testing Library with MSW** on the two screens with real logic: the booking page and
  the admin bookings table. Handlers built from the generated types so a mock cannot drift from
  the contract. The race recovery is the headline test — MSW answers `booking_overlap`, the test
  asserts the grid refetches and the slot is gone, with the other choices intact.
- Finish the Vitest coverage on the pure modules: the fan-out merge (ordering, labelling, no
  duplicates) and the error-code mapping (every handled code gets its own copy, an unknown code
  falls through to `detail`).
- **ADR-0009 — React over Blazor WebAssembly.** Blazor could have referenced `Dtos/` directly,
  making the wire contract compiler-checked end to end, and would have kept the project in one
  language. Record why ecosystem breadth and reviewer legibility won, and what was given up:
  the contract is now held by generated types plus a regeneration step.
- **ADR-0010 — The bearer token in `sessionStorage`.** Why not an `httpOnly` cookie: the API is
  bearer-only and issues no cookie, so the orthodox answer was not available without an API
  change that was out of scope. Why `sessionStorage` over `localStorage` and over memory, and
  how the five-minute warning absorbs ADR-0006's absent refresh tokens.
- **ADR-0011 — Client-side wall-clock handling.** The companion to ADR-0001. What
  `Kind.Unspecified` over the wire costs a JavaScript client, the `new Date(string)` and
  `toISOString()` traps specifically, and the branded-type-plus-one-module answer. Include the
  forced-`TZ` test as part of the decision, not a footnote.
- **ADR-0012 — Admin visibility of inactive catalogue rows.** Why one route answers differently
  by role, and why the public default did not move.
- **README**: a `web/` section — the two-process run, the type regeneration command, the
  mobile-first-client / desktop-first-admin split stated rather than left to be discovered, and
  a note that register returns no token and the frontend chains a login, since a reader would
  otherwise read that as a bug in one of the two. Screenshots in the style of the existing
  Scalar ones: the menu on a phone width, the slot grid, the overlap recovery, the admin day.

## Done when

- `npm run test` passes, and the overlap test fails if the recovery is removed.
- All four ADRs exist in `docs/adr/`, numbered 0009–0012, in the existing format, and each one
  names the alternative it rejected and what that cost.
- No ADR was written for English-only or for Tailwind — both are reversible, unsurprising and
  not real trade-offs, and the README covers the first.
- `GLOSSARY.md` still describes the vocabulary the frontend actually uses, **Catalogue** and
  **Menu** included, with no implementation detail added to it.
- The README's `web/` section is enough for someone who has never seen the repository to run
  both halves.
- Screenshots are committed under `docs/images/` alongside the existing ones.

## Comments

### Most of the testing scope was already standing

The two screens the ticket asks for were built with their tests in issues 05 and 07, against
MSW handlers typed from `schema.d.ts` — `pages/bookPage.test.tsx` and
`pages/adminBookingsPage.test.tsx`, 14 and 21 cases. The fan-out merge is covered by
`booking/slots.test.ts`, which has ordering, labelling and no-duplicates as separate cases
including the one that matters most: a shared start is attributed to the stylist the catalogue
lists first, so two stylists free at 09:00 is one button, not two.

So the gap this ticket actually closed was the second half of one bullet: the error-code
mapping had no test of its own. It has one now, `lib/errorCopy.test.ts`, 21 cases.

### An exhaustive list, in the one place an exhaustive list can be honest

`api/errors.ts` says there is deliberately no exhaustive list of the API's codes and no
completeness test, because they are not centralised in C# and such a test could not be honest.
The new test file contains an exhaustive list anyway, and the distinction is the point: it
lists the codes **the UI claims to handle**, which is a decision made in this repository.

It is exhaustive by construction rather than by diligence. `NothingMissing<Exclude<...>>`
fails `tsc` if `HandledErrorCode` grows a member the file does not mention, so the `it.each`
that follows really does say "every handled code" instead of "every handled code somebody
remembered". Verified against a planted violation: adding `booking_requires_deposit` to the
union fails with `Type '"booking_requires_deposit"' does not satisfy the constraint 'never'`
— alongside the error `errorCopy.ts` already gets from its `Record<HandledErrorCode, …>`.

`isHandledErrorCode` is asserted separately from the type, because the `HANDLED` set is
maintained beside the union rather than derived from it — "the type says handled" and "the
runtime guard agrees" are two claims.

### The overlap test, held to the ticket's own standard

`npm run test` passes: 22 files, 231 tests. The headline test was verified by removing the
recovery — deleting the `invalidateQueries` under `case 'refetch-slots'` in
`useConfirmBooking.ts` — which fails two cases, the overlap one and the `start_in_past` one
that shares the recovery:

```
× says the time went, drops it from the grid, and keeps every other choice
  AssertionError: expected [ '09:00–10:00', '10:00–11:00', …(1) ] to deeply equal [ '10:00–11:00', '11:00–12:00' ]
× refetches rather than retries when the start has slipped into the past
```

### The screenshots were staged against a running salon, not posed

Both halves were started, the catalogue seeded earlier was reused, two client accounts were
registered and eight bookings made across four stylists on 2026-11-17 — so every screenshot is
of real data the API served, and the admin day and the client's grid are the *same day* from
the two sides.

The overlap shot is a real race. The client picks a slot; a second client takes it through the
API while the first is still looking at it; the first presses Confirm and gets the refusal.
What is in the picture is the recovery doing its job: the notice, and the grid starting at
12:45 because 12:00 and the two starts that would overlap it are gone.

Two judgements about what to photograph. The grid shot uses **No preference** on a day whose
bookings are scattered across stylists, because on an empty day the merge attributes every
start to whoever the catalogue lists first and the picture reads as one stylist's diary rather
than four merged. The overlap shot names a stylist, because with No preference the time does
not disappear — somebody else is still free then, which is correct and unphotographable.

Capture was `puppeteer-core` driving the installed Chrome from a script in the scratchpad.
Nothing was added to `web/`: the spec's "no Playwright" is about the test suite, and this is
not one — it is a camera, and it is not in the repository.

### Where the `web/` section went

Into the root `README.md`, not `web/README.md`, because the ticket's test is a reader who has
never seen the repository running *both halves* — and that reader is at the root. It states
the two-process run, the regeneration command, the viewport split, the register chain and the
race, with the four screenshots where they explain something. `web/README.md` keeps its own
doorway and now points at it rather than repeating it.

The intro's "the eight ADRs" became twelve, and `Projects` gained a `web/` row — a reader
counting ADRs and finding eight would have been reading a stale README.

### Two small corrections made on the way

`wallClock.ts` said `toISOString` was banned "by lint". It is banned by `noConversions.test.ts`
— the spec is explicit that oxlint has no `no-restricted-syntax` and that the ban is a test
instead. ADR-0011 would have contradicted the module it describes.

`web/README.md`'s "Two things that will surprise you" is three things, now that registering not
signing you in is one of them.

### Against the ticket's "Done when"

- `npm run test` passes, and the overlap test fails if the recovery is removed — shown above.
- Four ADRs exist as `docs/adr/0009`–`0012`, in the existing format (a title that is a
  sentence, the argument, then `## Consequences`). Each names what it rejected and what that
  cost: Blazor's compiler-checked contract, traded for a regeneration step nothing enforces;
  the `httpOnly` cookie, unavailable without reopening ADR-0006, leaving an XSS as a stolen
  session; the conventional parse-to-instant date handling, which would have hardcoded
  `Europe/Belgrade` in the client; a separate admin route, traded away to avoid duplicating a
  projection, at the price of one route that answers by role.
- No ADR was written for English-only or for Tailwind. English-only is a README section
  instead, as the bullet requires: what is English, what is `sr-RS`, and why the split is
  deliberate rather than half-finished.
- `GLOSSARY.md` is untouched. It already carried **Catalogue** and **Menu** with the difference
  between them stated, and nothing the frontend built needed a word it does not have — which is
  the outcome the ticket was describing, not a step that was skipped.
- Screenshots are committed under `docs/images/` beside the Scalar ones, same format and
  roughly the same weight: the client's three at 390px with a 2× pixel ratio, the admin's at
  1568px like the existing four.

### What the two-axis review changed

Standards found no hard violations. Spec found one unmet "Done when" bullet and two checkable
claims that were wrong. All of it is fixed above rather than noted and left:

- **English-only had no README home.** The bullet says the README covers it, and it did not.
  It has its own section now.
- **The record claimed `adminBookingsPage.test.tsx` has 24 cases.** It has 21. A number in a
  record is either checked or not worth writing; this one was not checked.
- **The README said the bookings table is "seven columns plus two actions".** It is seven
  columns, the last of which holds the two actions. The spec says it the loose way; the README
  should not repeat a miscount because its source did.
- **A comment in the new test said "these four" above seven assertions** and attributed
  `show-field` to the booking page, which does not use it — the register form does.
- **ADR-0011 departed from the spec without saying so.** The spec describes a browser-local
  `parse`; the code uses `Date.UTC` as a neutral carrier. The code is right — a local `Date`
  shifts by an hour when arithmetic crosses the browser's own DST boundary — but ADR-0012
  flags its deviation and this one should too. `docs/agents/domain.md` asks for exactly that.

Two of the reviewer's judgement calls were taken as well: the exhaustiveness guard no longer
hangs off an exported `NOTHING_MISSING` type kept alive to dodge `noUnusedLocals` — the claim
sits on a local inside the test that depends on it, where it reads as an assertion rather than
a trick — and the file now uses straight apostrophes like every test beside it.

One was declined. The nine codes exist in four places (the union, the `HANDLED` set, the `COPY`
keys, the test list), which looks like duplication and is not: three of the four are
compile-enforced against the first, and the one that is not — the `HANDLED` set — is the
reason the test asserts `isHandledErrorCode` separately from the type.

Re-verified after all of it: `tsc -b` clean, `oxlint` clean, 22 files and 232 tests passing,
and the planted-violation check still fails at the right line.
