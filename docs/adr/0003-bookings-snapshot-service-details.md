# A booking snapshots the service it was made against

A booking stores its own `End`, `PriceAtBooking` and `ServiceNameAtBooking`, written once
at creation and never recalculated. `ServiceId` remains as a foreign key for reporting,
but no booking behaviour reads through it.

Services are editable. Without snapshotting, editing a service rewrites the past: if price
is read by joining to `Service`, a client who booked at 3000 RSD is silently billed the
new 3500. If `End` were derived from the current duration instead of stored, extending a
service would stretch bookings already taken and could create an overlap on a stylist's
schedule — breaking the system's central invariant through an admin edit, with no booking
request involved and no validation in the path to catch it.

This is the same reasoning that makes an invoice copy its line items rather than join to a
product table.

## Consequences

Service edits apply to future bookings only, which is the intended behaviour but must be
explained to admins, who may expect a price correction to apply to tomorrow's appointments.

Snapshot fields duplicate data that also exists on `Service`. That duplication is the
point and must not be "normalised away" later.
