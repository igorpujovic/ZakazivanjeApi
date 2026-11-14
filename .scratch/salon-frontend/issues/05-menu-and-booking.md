# 05 - Menu and booking: the slot grid, the fan-out, the race

Status: resolved
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

## Comments

**Implemented.** Three decisions worth knowing: one narrowing of the stated stack, one thing
built that nothing asked for, and one sentence of this ticket that could not be honoured
literally.

### The two client controls are native `<select>`, not Radix

`../spec.md` says "Radix for **Dialog and Select only**" and names six hand-built primitives.
`web/src/ui/NativeSelect.tsx` is a seventh, over a native `<select>`, and the Radix dependency
is therefore unused *so far*.

The spec's own reasoning is why. It picks Radix for Dialog and Select "because those two are
where focus trapping, focus restore, `Escape` handling and ARIA are easy to get wrong" — and a
native `<select>` gets none of them wrong, being the browser's. On the screen this ticket says
must be "usable one-handed at 390px", it opens the platform picker; a Radix listbox would
replace that with a custom one. The date input is native for the same reason and the spec says
so outright.

Radix's Select is kept for where that reasoning does hold: the admin stylist filter in issue
07, at 1280px, with a keyboard. The primitive is called `NativeSelect` rather than `Select`
precisely so it is not squatting the name that control will want.

### Partial failure of the fan-out

Neither this ticket nor the spec's five-code table covers one `available-slots` call failing
while the others answer — but asking N stylists at once creates that state, so something had to
be decided. Failing the whole grid because one of five stylists 500'd is worse than showing the
four that answered; merging the fifth in as "no free time" would be a lie. So `useSlots`
reports `unreachable` separately from `error`, the grid renders, and a line says some stylists
could not be checked. It has its own test.

### The `*_inactive` recoveries, and the sentence that needed a fallback

The scope says the two `*_inactive` codes "refetch and re-render, keeping the service, stylist
and date so an alternative is one tap away". Kept literally, a retired stylist leaves nothing on
screen: the stylist is gone from the catalogue, so no fan-out can run for them and the grid
empties. The first implementation did exactly that, and the code review caught that it also left
the control *displaying* "No preference" while still holding the dead id.

The rule as built: a withdrawn stylist falls back to **No preference**, which is a real answer to
"who" and fills the grid with the stylists who remain — so the alternative genuinely is one tap
away. A withdrawn *service* has no such default, its duration being what the grid is computed
from, so that one waits for a choice. The address keeps the original request, which is why the
banner explaining it survives a reload; every control renders from what is in force, so the page
can never ask about one stylist while showing another.

### Testing

The ticket's seven "Done when" items all have a test, plus the two cases above:
`web/src/booking/slots.test.ts` and `selection.test.ts` for the pure merge and the URL state,
`web/src/pages/bookPage.test.tsx` for the fan-out, the pasted link, the overlap, the contended
retry, `start_in_past`, both `*_inactive` codes, the closed Sunday and the keyboard, and
`menuPage.test.tsx` for the menu.

`../spec.md` scopes MSW to the booking page and the admin bookings table and assigns the booking
page's tests to issue 09. They are here instead, for the reason issue 04 gave: this ticket's
acceptance criteria *are* those tests, and nothing else in the plan would exercise them. Issue 09
keeps the error-code mapping test, the four ADRs, the README and the screenshots.

Every behaviour was checked by breaking it and confirming that only the matching tests failed —
the dedupe and the ordering in the merge, the breadth of the fan-out, the slots refetch, the
catalogue refetch, the contended pick, the No-preference fallback, partial-failure reporting, the
empty day, and the stylist id in the URL.

### Carried forward

- `catalogue.ts` ships `includeInactive`, which no screen here passes `true`. Kept rather than
  deferred to issue 08: it is one defaulted boolean, it is the entire reason issue 02 changed the
  API, and a catalogue module that could not express the admin's view would misrepresent the
  endpoint it wraps.
- `web/src/ui/Field.tsx` and `NativeSelect.tsx` both wire up `useId`, a label and a hint. Not
  extracted: the shared part is a few lines of markup around two different elements, and `Field`
  additionally composes `aria-invalid` and server field errors, so a common shell would have to
  take a render prop to be worth anything.
