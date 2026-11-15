# Salon Booking Web

The browser frontend for the Salon Booking API. Clients browse the menu, pick a time and book
or cancel; admins manage the catalogue and every booking.

**The decisions are written down elsewhere, and they are the point.** Start with
[`../.scratch/salon-frontend/spec.md`](../.scratch/salon-frontend/spec.md), then
[`../GLOSSARY.md`](../GLOSSARY.md) for the vocabulary this code is written in — client,
stylist, slot, catalogue, menu — and [`../docs/adr/`](../docs/adr) for the arguments. Nobody
finds those by reading components.

React, TypeScript, Vite, TanStack Query, React Router, Tailwind v4, Radix (Dialog and Select
only). Deliberately outside `ZakazivanjeApi.sln`.

## Running it

Two processes. The API first, from the repository root:

```bash
dotnet run --project ZakazivanjeApi
```

Then this, which proxies `/api` to it so development is same-origin:

```bash
npm install
npm run dev
```

## Scripts

| Script                 | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Dev server, proxying `/api` and `/openapi` to `localhost:5056`      |
| `npm run dev:mock`     | The same, against a demo salon in a service worker — **no API needed** |
| `npm run build`        | Typecheck every project, then build                                 |
| `npm run build:mock`   | A static build of the demo, for hosting it without an API           |
| `npm run test`         | Vitest, once                                                        |
| `npm run lint`         | oxlint                                                              |
| `npm run generate:api` | Regenerate the API types from a **running** API, then narrow them   |

`generate:api` needs the API up: the OpenAPI document is mapped in Development only. It writes
`src/api/schema.d.ts`, which is committed, and then runs `scripts/narrow-schema.mjs` over it —
read that script's header before changing it.

## Running it with no backend at all

```bash
npm install
npm run dev:mock
```

No .NET, no SQL Server, nothing to configure. `src/mocks/` answers every request from a salon
held in the tab, using MSW — the library the tests already use — with the real slot rules:
working hours, a service having to fit inside them, no overlapping a stylist, nothing in the
past. Sign in as `admin@salon.demo` / `demo`, or register a client.

Read `src/mocks/salon.ts` before trusting it for anything: it is a stand-in so the application
can be clicked through, not a second implementation of the API, and where the two disagree the
C# in `../ZakazivanjeApi/` is right.

## Three things that will surprise you

**Times are local salon wall-clock with no offset** (ADR-0001), which JavaScript mishandles in
two specific ways. Everything date-shaped goes through `src/lib/wallClock.ts`, nothing else may
construct a `Date` from an API string, and `toISOString`/`toJSON` are banned in `src/` by
`src/lib/noConversions.test.ts`. Read that module's header first.

**A slot is an offer, not a hold.** Two clients can be shown the same start and the first to
confirm takes it, so losing a booking to a race is normal operation. `src/lib/errorCopy.ts`
maps each refusal to what the UI should do about it.

**Registering does not sign you in.** `POST /api/auth/register` answers `201` with no token, so
`RegisterPage` chains a login with the credentials already in memory. Two requests for one
button, deliberate on both sides.

The root [`README.md`](../README.md#the-web-frontend) has the rest: running both halves,
regenerating the types, the mobile-first-client / desktop-first-admin split, and screenshots.
