# 08 - Admin catalogue: services and stylists

Status: resolved
Type: task
Blocked by: 02, 03, 04

Spec: `../spec.md`

The two screens an admin curates the **catalogue** from. The glossary governs the copy here more
than anywhere else in the application, and getting it wrong is the mistake a reader who knows
the glossary will spot first.

## Scope

- `/admin/services` and `/admin/stylists`. One table each, a "Show inactive" checkbox driving
  `?includeInactive=true` from issue 02, inactive rows dimmed with an "Inactive" badge.
- Activation as an **inline toggle**. Switching it **off** confirms, in glossary wording: it
  disappears from the menu and bookings already made keep it. Not "this cannot be undone" —
  reactivating makes it very much undoable. Switching it **on** does not confirm.
- The word "delete" appears nowhere, even though the route is `DELETE /api/services/{id}`.
  Nothing is deleted. The verb is **withdraw**.
- Create and edit in a Radix side panel, not a route, so the eight routes stay eight and the
  list stays visible behind it. The service edit panel loads from `GET /api/services/{id}`,
  which is the only route that returns an inactive service by id.
- One line in the edit panel: changes do not affect bookings already made. That is ADR-0003 made
  visible to the only person who would ever worry about it.
- Native input constraints from `limits.ts`; server `errors` mapped onto panel fields.
- Services create via `POST` (no `IsActive` in the payload — a new service is always active),
  update via `PUT` including `IsActive`. Stylists create via `POST`, update and deactivate via
  `PUT`.
- Desktop-first. Empty states for a salon with no services or no stylists yet.

## Done when

- Deactivating a service removes it from the public menu, leaves it visible under "Show
  inactive", and leaves every booking against it untouched.
- Reactivating it puts it back on the menu and it can be booked again.
- The confirmation copy for withdrawing matches the glossary's **Active** entry, and no screen,
  button, tooltip or dialog in the application says "delete".
- Editing a service's price does not change the price shown on an existing booking — verified
  against a booking made before the edit.
- A 250-character name is refused by the browser before a request is sent; a name of only spaces
  is refused by the server and the message lands on the name field.
- The side panel traps focus, closes on `Escape`, and returns focus to the row that opened it.
- A stylist with existing bookings can be deactivated, and those bookings still show their name.

## Comments

**Implemented.** Four things are worth knowing: one asymmetry the API forced and where it was
put, the request the edit panel opens through and the bug it very nearly hid, a Radix behaviour
that quietly breaks focus restore, and why the two screens are siblings rather than one
parameterised screen.

### Three asymmetries, settled in one place

The two halves of the catalogue differ in exactly three ways, and all three are the API's
doing. Withdrawing a service is `DELETE /api/services/{id}`, which sets the flag and nothing
else; withdrawing a stylist is `PUT`, there being no `DELETE` for somebody every booking ever
taken points at. Putting either back is `PUT`, the flag being the only thing that sets it
(ADR-0004). And only a service can be read back by id.

They live in `catalogue/catalogueAdmin.ts` as one `CatalogueAdmin` object per half, so the
screens, the toggle and the panel never learn any of it. The copy differences live in
`catalogue/withdrawal.ts`, which quotes the glossary's **Active** entry as its specification:
a service comes off the **menu**, a stylist stops being offered for **new bookings**, both keep
the bookings already made, and neither is irreversible — "this cannot be undone" would be a
plain untruth told to frighten someone out of tidying their own catalogue.

### The edit panel's request, and the flag that nearly did not use it

The ticket asks the service panel to open through `GET /api/services/{id}`. The reason is that
`PUT` is a full replacement: a form filled from a list row fetched minutes ago posts that stale
copy back over whatever has happened since.

The first implementation fetched the row and then took `isActive` from the list row anyway —
so correcting a typo in a service somebody else had withdrawn would have put it back on the
menu, which is the exact silent reactivation `UpdateServiceRequest` requires the flag in order
to prevent. Found in review, fixed, and now the case the test names: the row says active, the
API says withdrawn, and the `PUT` carries `false`.

The draft is derived rather than copied into state — the API's answer overlaid with whatever
has been typed — so there is no effect synchronising a form with a fetch, and a slow answer
cannot overwrite what somebody is in the middle of writing.

### Radix loses the row a dialog was opened from

Radix restores focus to whatever was active when its focus scope was set up, and that effect
re-runs on **every render of an open dialog**, recapturing as it goes. By then focus is inside
the dialog, so what gets remembered is the dialog itself — and when it closes, the browser
falls back to `<body>`.

Both of this application's dialogs re-render while open: the side panel when the service it is
editing arrives, either of them when a request starts. So both would have dropped a keyboard
user at the top of the document, which is precisely the failure Radix was chosen to avoid.
`ui/openerFocus.ts` remembers the opener at the click instead and refuses Radix's own restore.
It also explains why `WithdrawalDialog` stays mounted with `open={false}` rather than returning
`null`: a dialog that unmounts the moment it is answered takes its own closing with it.

### Two screens, not one

`/admin/services` and `/admin/stylists` share their hooks, their toggle, their dialog, their
panel buttons and the "Show inactive" parameter, but not their JSX. A frame taking columns and
form fields as props would have parameterised every line of copy on both screens — and on
screens the glossary governs this closely, copy is the thing a reader should be able to read
straight down the page.

### Against the ticket's "Done when"

All seven hold. Four are journeys through the real route tree with the cache frozen, because
four of the seven are claims about two screens rather than one: withdraw a service and it
leaves the menu on `/`, put it back and it returns; withdraw it and the booking against it is
still there, still named, still at the price it was taken at and still `Scheduled`; edit a
price to 3.000 and the booking taken at 2.500 still says 2.500; withdraw a stylist and their
day still carries their name. With `staleTime: Infinity`, only a real invalidation can make the
second screen agree.

The rest: the confirmation's wording is asserted against the glossary's entry rather than
against itself — what it must say, and that it never says "delete", "cannot be undone" or
"permanent". A 250-character name cannot be typed into the box, so no request carrying one is
made; a name of spaces is refused by the server and lands on the name field, and the complaint
clears as soon as that field is touched. The panel traps focus, closes on `Escape` and hands
focus back to the row.

`src/lib/noDeleteWord.test.ts` makes the ban on the word application-wide rather than
screen-deep, in the same shape as `noConversions.test.ts`: it scans the text a person could
read — string literals and words between tags, comments stripped — across `src/`, with the
request method and the generated contract named as the two exceptions. Verified against a
planted violation: a "Delete" button added to the services page fails it.
