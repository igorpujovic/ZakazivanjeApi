# 08 - Admin catalogue: services and stylists

Status: ready-for-agent
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
