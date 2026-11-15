# 04 - Booking rules as pure classes, with unit tests

Status: resolved
Type: task
Blocked by: 01

Spec: `../spec.md`

The heart of the project. These classes reference **no EF Core, no `DbContext`, no HTTP**
(ADR-0007). They take plain inputs and return decisions, which is what makes the rules the
easiest thing in the codebase to test rather than the hardest.

Depends on 01 only for the solution and options type — it needs no database and could be
built first.

## Scope

In `Domain/`:

- An interval type over `Start`/`End`, half-open `[Start, End)`.
- Overlap: `a.Start < b.End && b.Start < a.End`. Touching intervals do **not** overlap.
- Working-hours check against the weekday's open/close, testing **`End`** as well as
  `Start`.
- Past-start check against an injected `TimeProvider`.
- Cancellation-deadline check: a client may cancel while `now <= Start - 2h`; an admin is
  unbound.
- Slot generation: step by `SlotGridMinutes` from opening, keep candidates where the whole
  duration fits working hours and overlaps no busy interval; drop past starts when the
  date is today.
- A result type carrying success or a failure with a machine-readable code
  (`booking_overlap`, `outside_working_hours`, `start_in_past`, `cancellation_too_late`,
  `stylist_inactive`, `service_inactive`). Rules **return** failures, they do not throw
  (ADR-0007).

## Tests

The four the specification names, plus the boundaries that actually bite:

- Overlap: full containment, partial on each side, identical, and **touching is legal**
  (a booking ending 11:00 against one starting 11:00).
- Working hours: a 30-minute service at 16:45 against a 17:00 close is **refused** - the
  failure is on `End`, not `Start`. A service ending exactly at close is accepted.
- Past starts, including a start exactly equal to "now".
- Cancellation deadline: 2h01m before is allowed, 1h59m is not, exactly 2h is allowed.
- Slot generation: the spec's worked example reproduced exactly - 09:00-17:00, 90-minute
  service, existing 11:00-11:30 booking, expecting
  `09:00, 09:15, 09:30, 11:30, ... 15:30`. Plus a closed weekday returning empty, and
  today's past slots being filtered.

## Done when

- `dotnet test` passes with no database running and no mocking framework involved.
- Nothing in `Domain/` references `Microsoft.EntityFrameworkCore`.
