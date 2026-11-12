# Working hours are per-weekday, and live in configuration

Working hours are bound from `appsettings.json` into a validated options class holding one
optional open/close pair per weekday, where a missing pair means the salon is closed that
day.

The original specification called for a single range for all days. Read literally that
makes Sunday 09:00–17:00 bookable, which no salon wants, and there is no way to express a
short Saturday. Per-weekday ranges fix that at the cost of one extra level of nesting in
config, and keep hours out of the database as the specification intended.

## Consequences

The options class is validated at startup, so a malformed range fails the application on
boot rather than at the first booking attempt.

Two things are deliberately not modelled, and the salon has no way to express them:

- **Public holidays.** There is no closed-dates list. Bookings on 1 January must be
  refused by hand.
- **Per-stylist schedules.** Every stylist is assumed available during all salon hours. A
  stylist who works mornings only cannot be represented; the workarounds are placeholder
  bookings or deactivation.

Both would need a database table and admin endpoints, which is a feature in its own right.
