# 09 - Cross-cutting: tests, four ADRs, README

Status: ready-for-agent
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
