# Wall-clock times reach the client as branded strings through one module

The companion to ADR-0001. The server keeps every booking time as `DateTime` with
`Kind.Unspecified` — the time on the salon's wall — so the wire carries
`"2026-11-20T09:30:00"` with no `Z` and no offset. On the client, every such value is a
branded string (`WallClock`, `WallClockDate`) that only `web/src/lib/wallClock.ts` can
produce, and nothing else in `src/` may construct a `Date` from an API string or convert one
back.

JavaScript is the worst available consumer of that string, in two specific ways rather than
vaguely:

`new Date("2026-11-20T09:30:00")` parses the no-offset form as **browser-local**. The
components survive a round trip in Belgrade and nowhere else, so the bug renders correctly on
the developer's machine and wrongly for a visitor in London — and it renders wrongly rather
than failing, which is why no test written on a Belgrade laptop would have caught it.

`.toISOString()` converts to UTC. A value read into a `Date` and serialised back posts an hour
off, reintroducing on the client the exact defect ADR-0001 exists to prevent on the server.
`POST /api/bookings` would be accepted, stored, and shown to the stylist at the wrong time.

The alternative was the conventional one: carry instants, not readings — parse each string into
a `Date` by appending the salon's zone, work in UTC internally, and render through
`Intl.DateTimeFormat` with `timeZone: 'Europe/Belgrade'`. It was rejected because it requires
knowing the salon's zone on the client, which the API never sends and which would then exist as
a hardcoded `'Europe/Belgrade'` in the frontend, silently contradicting ADR-0001's claim that
no conversion happens anywhere. It also makes every value a *moment*, and these are not
moments: a slot at 09:30 is 09:30 whatever the reader's zone, and the correct render of it in
London is 09:30, not 08:30.

So the module holds three rules. A wall-clock value is a string of components and is never
held as a `Date`. Where a `Date` is unavoidable — arithmetic, `Intl` — it is built with
`Date.UTC` from explicit components and read back with `getUTC*`, with every `Intl` call
passing `timeZone: 'UTC'`: UTC as a neutral carrier, not as a timezone, so the components that
go in are the ones that come out. Comparison needs no `Date` at all, because these strings are
fixed-width and big-endian, so lexicographic order *is* chronological order.

**The forced `TZ` is part of the decision, not a detail of the tests.** `vite.config.ts` runs
the whole suite under `TZ=Asia/Kolkata` — not Belgrade, and a half-hour offset with no DST on
purpose, because a half-hour offset breaks naive arithmetic harder than a whole-hour one and
because a timezone test that passes only when the machine agrees with the server is worse than
no test. Without it, `wallClock`'s round-trip tests would pass against an implementation that
did the wrong thing.

## Consequences

The ban is enforced by a test, not a lint rule. `src/lib/noConversions.test.ts` scans `src/`
with comments stripped and fails on `toISOString` or `toJSON` anywhere — so `wallClock.ts` can
explain the trap at length while a real call fails the suite. A lint rule would have been the
natural home, but the Vite scaffold ships **oxlint**, which does not implement
`no-restricted-syntax`, and adding ESLint alongside it to express one rule is a poor trade.
It was verified against a planted violation.

This is a deviation from `.scratch/salon-frontend/spec.md`, which described the same intent
with a different mechanism: a single `WallClockString` brand, and a `parse` building a
*browser-local* `Date` with `new Date(y, m - 1, d, h, min)` so that `Intl` would render the
right components in any zone. That renders correctly, and was not taken all the same, because
of arithmetic: a local `Date` is anchored in the browser's own timezone, so adding minutes
across that zone's daylight-saving discontinuity shifts the wall-clock reading by an hour, and
a reading the salon never wrote comes back out. `Date.UTC` has no discontinuity to cross. The
brand also split in two, because a `DateOnly` and a `DateTime` are different things on the
wire, and conflating them would let a bare `"2026-11-20"` stand where a time was wanted.

The brand has to be applied to generated types, which a generator does not do. The two date
positions in `schema.d.ts` are rewritten by `scripts/narrow-schema.mjs` inside
`npm run generate:api`, so the narrowing cannot be lost by regenerating; the script exits
non-zero if any rule stops matching. One field is exempt: `AuthResponse.expiresAt` is built
from `timeProvider.GetUtcNow()` and really is a `DateTimeOffset` with a zone attached, so it is
compared with `Date.parse` and never goes through this module — a token's death is not a
reading on the salon's wall.

Date arithmetic is the module's job and the module's alone, which makes it the one place a
calendar bug can live and also the only file to read when one is suspected. Anything needing a
new operation on a time adds it here instead of reaching for a `Date` locally; that is the
cost of the rule and the reason it holds.

No date library. Temporal would express this exactly — `Temporal.PlainDateTime` is literally a
wall-clock reading with no zone — and is the right answer once it can be relied on in every
browser this has to run in. Until then, a polyfill or a library's plain-datetime type is a
dependency carrying a timezone database to avoid under three hundred lines, for an application
whose date vocabulary is parse, format, add minutes or days, compare, and difference.
