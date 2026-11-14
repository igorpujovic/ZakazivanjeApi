# 07 - Admin bookings: the day, the filters, cancel and complete

Status: resolved
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

## Comments

**Implemented.** Five things are worth knowing: one piece of vocabulary the ticket needed and
did not have, one line of the spec that turned out to contradict a decision issue 06 had
already committed to, the page size with no control, the second Radix component finally earning
its dependency, and a disabled button that is deliberately not disabled.

### "Clear the date" needed a word in the address

The ticket asks for a default of today *and* an escape hatch to the whole history, which means
the address has to tell "no day chosen" apart from "every day, on purpose" — the first defaults
to today and the second must send no `Date` at all. An absent parameter can only express one of
them. So `?date=all` is a value: `/admin/bookings` is today, `?date=2026-11-20` is that day, and
`?date=all` is every booking ever. It survives being pasted, which an empty `?date=` would not,
and `all` is nothing a `WallClockDate` can ever be, so it cannot collide with a real day.

The day is therefore written into the address even when it *is* today, which is what makes a
pasted link restore the day it was copied on rather than the day it is opened on.

### The already-resolved codes stayed out of `HandledErrorCode`

The ticket wants `booking_already_cancelled` / `booking_already_completed` to "surface as
'someone already did this', with a refetch", and the obvious reading is to add both to the
spec's narrow union and give them copy. Issue 06 had already committed the opposite: a test in
`myBookingsPage.test.tsx` whose documented point is that `booking_already_cancelled` is
deliberately *unhandled*, so the screen falls through to the API's `detail` — "this is what
degrading gracefully looks like".

Both are right, because the API's own `detail` **is** "someone already did this": *"That booking
has already been cancelled."* What this screen adds is not a better sentence but the refetch.
That is a fact about which codes mean the table is stale, not words for a person, so it lives in
`adminBookings.ts` as `meansAlreadyResolved` and the message stays the API's. Nothing is
duplicated and issue 06's demonstration survives.

`booking_not_started` **was** added to the union, with no such conflict: the tooltip on a
disabled Complete button has to say the thing the refusal would have said, and `copyForCode` is
how `/bookings` already reaches the cancellation deadline's wording. The spec's listing of the
union was updated to match, the criterion it states — "the ones the UI has distinct copy for" —
being exactly what changed.

### The page size is in the address and has no control

"`pageSize` is capped at 100 rather than refused, so the response says which size was actually
used and the UI reports that, not what it asked for" is only demonstrable if an absurd size can
be asked for. A control offering 20/50/100 would keep every request inside the cap and make the
sentence vacuous. So the size is read from the address, for nobody but a hand-editor, and
`?pageSize=500` really does come back as a hundred rows with a footer that says 100. `pageView`
takes the *response* and not the filters, so there is no way for the footer to report the
request even by accident.

### Radix's Select, and the three APIs jsdom does not have

`ui/Select.tsx` is the second of the two Radix components the spec asks for, and this stylist
dropdown is the only select in the application — `NativeSelect` already explains why the client
side uses the browser's own control and says the Radix one is the admin's, which left the name
`Select` free for exactly this.

It costs three lines in `test/setup.ts`. Radix drives the listbox with pointer capture and then
scrolls the chosen item into view, and jsdom implements neither, so opening the list dies with
`target.hasPointerCapture is not a function`. Stubbed rather than implemented: pointer capture
decides which element keeps receiving events mid-drag, and nothing here depends on the answer.

### Complete is `aria-disabled`, not `disabled`

The ticket asks for the button to be disabled before `Start` has passed *with a tooltip saying
why*. A genuinely `disabled` button leaves the tab order, so on the screen the spec says is used
with a keyboard, the explanation would be reachable only by mouse. It is `aria-disabled` with an
accessible description instead — focusable, hoverable, announced — and simply has nothing wired
to it, so the request the API would refuse with `booking_not_started` is still never sent.

### Two smaller judgements

Cancelling invalidates the slot queries and completing does not, because `BookingRules` counts
Scheduled *and* Completed bookings as occupying a stylist: only a cancellation frees an hour.
And an emptied date input falls back to **today** rather than to the whole history — clearing it
with a backspace is easy to do by accident, and the whole-history view has its own button saying
what it is.

### Against the ticket's "Done when"

All eight hold, each with a test: today rather than 2019 asserted on the outgoing request;
prev/next moving the day and the address together; the cleared date sending no `Date` and
labelling itself; twenty-five bookings paged through with the row either side of the seam
checked; cancelled and completed rows staying in the day with their badges; Complete disabled
with its explanation on a future booking and live on one under way; a booking ten minutes out
cancelled successfully; and a second completion showing the API's words and refetching.

Verified against planted violations rather than assumed: swapping the today default for the
whole history, gating Complete on `End` instead of `Start`, and making `meansAlreadyResolved`
answer `false` fail eleven tests between them, including both refetch tests.
