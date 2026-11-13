# 05 - Menu and booking: the slot grid, the fan-out, the race

Status: ready-for-agent
Type: task
Blocked by: 03, 04

Spec: `../spec.md`

The front door and the one screen that matters. The menu is the landing page — the first thing
anyone sees — and `/book` is where the concurrency work behind ADR-0005 becomes visible to a
human being.

## Scope

- `/` — the **menu**: active services from `GET /api/services`, name, duration and price, priced
  via `Intl` with `sr-RS`. Mobile-first at 390px. This screen gets real visual effort.
- `/book` — one page, state in the URL as `?serviceId=&stylistId=&date=`, so a choice is linkable
  and the back button works. Three controls, then the slot grid once all three are set. Native
  date input with `min` set to today.
- **No preference** as the default stylist option: one `available-slots` call per active stylist
  for that date, in parallel via TanStack Query, merged into one ascending grid with each slot
  labelled by who is free. A named stylist collapses to a single call.
- The grid states that a time is not held until confirmed. An empty grid is a real answer — a
  closed weekday, a retired stylist, a full day — and renders as `EmptyState`, not an error.
- Confirm posts `POST /api/bookings` and, on success, invalidates the slots query and
  `bookings/my`, then sends the user to `/bookings`.
- The five failure recoveries, per the spec's table. `booking_contended` is the only one with a
  retry button. `booking_overlap`, `start_in_past` and the two `*_inactive` codes refetch and
  re-render, keeping the service, stylist and date so an alternative is one tap away.
- No pre-check before posting. A slot is an offer, not a hold.
- Slot grid keyboard support: arrow keys across the grid, Enter to pick, visible focus.

## Done when

- Picking a service, leaving the stylist on No preference and choosing a date shows every free
  start across all active stylists, each labelled, with no duplicates and in time order.
- Changing the service re-queries in place and the grid updates without a navigation.
- A `/book?serviceId=3&stylistId=1&date=2026-11-20` URL pasted fresh renders the same state.
- Booking a slot that was taken a second earlier shows the overlap message, the grid refetches,
  and that time is gone from it — with the other three choices intact.
- `booking_contended` offers a retry that can succeed without re-entering anything.
- A closed Sunday shows the empty state, not an error.
- The grid is usable one-handed at 390px, and navigable by keyboard alone.
