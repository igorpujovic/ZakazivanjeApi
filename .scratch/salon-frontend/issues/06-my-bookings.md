# 06 - My bookings: list and cancel

Status: resolved
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

## Comments

**Implemented.** Four things are worth knowing: one judgement the ticket left open, one
outcome the ticket did not name, the Radix Dialog finally earning its dependency, and one
sentence of the ticket that was honoured by *not* writing it twice.

### Where a cancelled booking that has not happened yet goes

"Upcoming first, past below" does not say which group holds a booking that is `Cancelled` and
still dated next Tuesday. The split is on **time alone**, so it stays in Upcoming, dimmed, with
its badge and no actions.

The alternative — Upcoming meaning *Scheduled and in the future* — puts a row dated next
Tuesday under a heading that says Past, which is simply false. The badge already says it will
not happen, and a third "Called off" heading is a lot of furniture for a screen the ticket
calls small.

The line between the groups is the booking's **end**, not its start. A client in the chair at
half past ten has not had a past appointment.

### Cancel has three answers, not two

The ticket asks to "hide or disable Cancel on bookings already past the deadline" and to say
why. Written as the two cases that sounds like, a `Scheduled` booking from last June — a
no-show the salon never closed out, which `GLOSSARY.md` says stays `Scheduled` until an admin
cancels it after the fact — renders "please call the salon" under **Past**. Nonsense: there is
nothing to call about.

So `cancelOffer` answers `offered`, `too-late` or `none`, and `none` covers both a terminal
status and a booking that is simply over. `too-late` is reserved for the case the sentence was
written for: an appointment still to come that is now inside two hours.

The status check is `!== 'Scheduled'` rather than a test for the two known endings, because
`BookingResponse.status` is typed `string` — OpenAPI carries no enum for it — so a status this
build has never heard of is a shape the API could really send, and the safe reading of one is
that there is nothing to offer. A review pass caught that an earlier `isBookingStatus` guard
here was dead code; it was removed and the test covering an unrecognised status was kept, after
confirming it fails when the condition is written the other way.

### Radix arrives, for the half of the spec it was chosen for

Issue 05 narrowed the stated stack to native `<select>` and left the Radix dependency unused.
`web/src/ui/ConfirmDialog.tsx` is the Dialog half, and the spec's reasoning holds here exactly
as written: focus trapping, focus restore, `Escape` and `aria-modal` are what a hand-rolled
modal gets wrong. Radix Select is still waiting for issue 07, as 05 said.

Two decisions inside it. The buttons are **not** "Cancel" and "OK" — on a screen whose action
is itself called cancelling, a dismiss button labelled "Cancel" is a real trap, so the choices
are "Yes, cancel it" and "Keep it". And the dialog **refuses to close while the request is in
flight**: a press outside or `Escape` would leave a mutation running behind a dialog that had
gone, with the answer — including a refusal that needs reading — nowhere to be shown. That rule
lives only in the dialog, so `useCancelBooking.dismiss` carries no second copy of it.

Relatedly, the dialog's open-ness is kept on the booking's **id**, while the line naming the
appointment is looked up in the current list. If the list refetches under an open dialog the
sentence stays accurate, and if the row vanishes mid-request the dialog still stands to show
what the API said.

### "Rather than showing the raw `detail`" is about one sentence, not two

The ticket asks for the deadline to get its own copy. The first implementation wrote that copy
twice — once in `errorCopy.ts` for the refusal, once on the row for the case the screen knows
about without having been refused — and the two had already drifted apart by a word. That is
precisely what `copyForCode` exists for, and the row now goes through it. One phrasing of the
rule in the application; the prose itself is pinned by a literal assertion in the refusal test.

A second drift of the same kind: the empty state's call to action pointed at `/book`. The
ticket says "pointing at the **menu**", and the menu is `/` — `GLOSSARY.md` keeps the two
apart. Picking a service on the menu also carries that choice into `/book` with one of its
three controls already answered, so it is the better funnel as well as the specified one. Its
styling now comes from `ui/buttonClass.ts` rather than a hand-copied class string; it stays a
`<Link>` because it navigates, and a `<button>` calling `navigate` would give up middle-click,
the status bar and its place in the tab order as a link.

### What "only their own bookings" can and cannot be proved here

"Confirmed by signing in as a second client" is half an API claim and half a frontend one. The
API's half is `GET /api/bookings/my` taking no client id and reading the caller's from the JWT,
and it is tested on that side. The frontend's half — that the only thing deciding whose
bookings appear is which session is on disk, and that nothing here filters, re-checks
`clientId` or leaks one identity's cache into another's — is tested by signing in as two
clients with two tokens and asserting two different lists. `signedInAs` grew an identity
argument for it, because a question about two clients cannot be asked with one.

### Testing

Both seams were agreed before anything was written: a pure module, and the screen.

`web/src/booking/myBookings.test.ts` covers the grouping and the deadline against data — the
minute either side of two hours, the two-hour mark itself (which the API *allows*, so an
off-by-one here would hide the button from someone entitled to it), the booking under way, the
cancelled future booking, a shared start, and the booking that is simply over. It is handed a
scrambled list on purpose: the API answers `Start`-then-`Id` ascending, so a list in the API's
own order would not reveal whether anything sorted at all.

`web/src/pages/myBookingsPage.test.tsx` covers the rest through the screen, including the
ticket's hardest criterion — cancelling frees the slot, verified by `/book` offering that start
again — driven as the round trip a client really makes. That test needed
`renderRoute(path, { staleTime: Infinity })`: with the default every query refetches on mount
anyway, so a grid re-asking would prove nothing and the test would pass with the slots
invalidation deleted.

Every behaviour was checked by breaking it and confirming that only the matching tests failed:
the end-versus-start boundary, the deadline comparison, the past group's direction, the id
tiebreak, the unrecognised status, both invalidations, the shared copy, the deadline line, the
declining button, the over-and-done case, the menu link, and the sort.

### Carried forward

- `ConfirmDialog` keeps a `tone` prop whose `primary` branch has no call site yet. Not
  speculation: `../spec.md` specifies a confirmation that is deliberately *not* destructive —
  withdrawing a service "confirms, in glossary wording … not 'this cannot be undone', because
  reactivation makes it very much undoable" — and painting that button red would contradict the
  sentence beside it. Issue 08 uses it.
- A `500` from cancel renders the generic fallback line, which is correct and is left untested
  here: `../spec.md` gives the error-code mapping test to issue 09, and the screen-level
  contrast this ticket does need — an unhandled code falling through to `detail` — is covered
  by `booking_already_cancelled`.
- The deadline is read from the clock at render, so a page left open across the two-hour mark
  goes on offering the button. That is why the refusal is handled at all, and the ticket says
  so; a timer re-rendering every row every minute to withdraw a button nobody is looking at
  would be the worse trade.
- `api/dto.ts` exports `isBookingStatus`, which nothing now calls. It predates this ticket and
  was left alone rather than removed under it.
