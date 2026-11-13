# 06 - My bookings: list and cancel

Status: ready-for-agent
Type: task
Blocked by: 03, 04

Spec: `../spec.md`

A client's own bookings, and the one action they have over them. Small screen, but it is where
the **Cancellation Deadline** becomes real to somebody.

## Scope

- `/bookings` — `GET /api/bookings/my`, upcoming first, past below, status as a badge. Times and
  prices through `wallClock` and `Intl`.
- Each booking shows what was agreed: the snapshotted `serviceName` and `price`, not the
  catalogue's current values. ADR-0003 means these can differ, and the booking's own figures are
  what the client agreed to.
- Cancel on a `Scheduled` booking, with a confirmation. Invalidate `bookings/my` on success, and
  the slots query too, since cancelling releases the stylist's time.
- `cancellation_too_late` gets its own copy naming the two-hour deadline, rather than showing
  the raw `detail`. A client who is inside the deadline should understand *why*, not just that
  it failed.
- Hide or disable Cancel on bookings already past the deadline rather than offering an action
  that is certain to be refused — but handle the code anyway, because the deadline can pass
  while the page is open.
- `Cancelled` and `Completed` bookings are visible and have no actions. Terminal is terminal.
- Empty state for a client with no bookings, pointing at the menu.

## Done when

- A client sees only their own bookings — confirmed by signing in as a second client.
- Cancelling a booking more than two hours out succeeds and the badge changes to Cancelled.
- A booking inside the two-hour deadline offers no Cancel; forcing the request anyway produces
  the deadline-specific message, not raw `detail`.
- A booking whose service was renamed or re-priced afterwards still shows the name and price
  agreed at the time.
- Cancelling frees the slot, verified by the booking page offering that start again.
- A new account's `/bookings` shows the empty state.
