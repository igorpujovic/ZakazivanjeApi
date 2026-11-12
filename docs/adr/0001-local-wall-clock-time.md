# Times are stored as local salon wall-clock time

The salon has one location, in Belgrade, and charges in RSD. Booking times are stored as
`DateTime` with `Kind.Unspecified`, meaning "the time on the salon's wall" — no UTC
conversion anywhere, in storage, in the rules or at the API boundary. What a client sends
is what the stylist reads off the schedule.

The alternative was storing UTC and converting at the edges. That is the correct answer
for a business in more than one timezone, but here it would put a conversion in front of
every rule check and every slot calculation and buy nothing, since there is only ever one
wall to read.

## Consequences

Daylight saving is unhandled by construction. Belgrade shifts at 02:00–03:00, hours when
the salon is shut, so no booking can span the discontinuity while working hours stay
inside roughly 08:00–20:00. This holds only while the salon is a single location in a
single timezone. A second salon elsewhere invalidates the decision outright and means
migrating stored values to UTC — a schema and data migration, not a refactor.

"Now" is never read from the system clock directly. It comes from an injected
`TimeProvider`, because the rules for past start times and the cancellation deadline are
otherwise untestable.
