# 07 - Admin bookings: the day, the filters, cancel and complete

Status: ready-for-agent
Type: task
Blocked by: 03, 04

Spec: `../spec.md`

The receptionist's screen, and the only caller of the one paginated endpoint in the API.

## Scope

- `/admin/bookings` — `GET /api/bookings`, defaulting to **`date=today`**. The endpoint orders by
  `Start` then `Id` ascending, so calling it bare lands on the oldest bookings in salon history;
  the page must choose a default rather than pass nothing.
- The day in the URL, prev/next day buttons either side of a date input, plus a stylist dropdown
  from `GET /api/stylists`.
- A "clear date" escape hatch, labelled explicitly as the whole-history view so nobody reads it
  as a broken default.
- Pagination honouring the response's own `page`, `pageSize`, `totalCount` and `totalPages` —
  including the fact that `pageSize` is capped at 100 rather than refused, so the response says
  which size was actually used and the UI reports that, not what it asked for.
- No status filter: the endpoint has none, and filtering client-side within a page would make
  "20 of 143" a lie. Status is a badge per row.
- Columns: time, client, stylist, service, price, status, actions. `BookingResponse` already
  carries `clientId` and `clientName`, so no second call.
- Cancel per row with a confirmation — an admin cancelling someone else's booking has no undo.
  Admins are not bound by the two-hour deadline (ADR-0004).
- Complete per row, **disabled until `Start` has passed**, with a tooltip saying why, so the UI
  never sends a request it knows returns `booking_not_started`. Gated on `Start`, not `End`, so
  a stylist finishing early can still close a booking out.
- `booking_already_cancelled` / `booking_already_completed` surface as "someone already did
  this", with a refetch — two admins on the same day is the obvious cause.
- Desktop-first at 1280px, `overflow-x: auto` and nothing more below that.

## Done when

- Opening the page shows today, not 2019.
- Prev/next moves the day and the URL, and a pasted URL restores that day.
- Clearing the date shows page one of all bookings ever, labelled as such.
- Paging through a day with more than twenty bookings never repeats or skips a row.
- Cancelled and completed bookings appear in the day with their badges, not filtered away.
- Complete is disabled on a future booking with an explanatory tooltip, and enabled the moment
  `Start` has passed.
- Cancelling a booking that starts in ten minutes succeeds — the client deadline does not apply.
- Completing a booking a second time shows the already-done message and refetches.
