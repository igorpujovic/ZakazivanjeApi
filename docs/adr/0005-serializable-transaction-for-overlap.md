# Overlap is enforced by a serializable transaction plus a filtered unique index

Booking creation runs its overlap query and its insert inside a single `Serializable`
transaction. Underneath, a filtered unique index on `(StylistId, Start)` where the status
is `Scheduled` acts as a second line of defence. A violation surfaces as `409 Conflict`.

Checking for overlap in application code and then inserting is a check-then-act race: two
requests for the same stylist and time can both read a free schedule before either
commits, and both succeed. The result is a double-booked stylist — the one invariant the
system exists to protect — with no error raised to anyone.

SQL Server cannot express "no overlapping intervals" declaratively; it has no exclusion
constraint. The filtered index catches identical start times, which on a fixed slot grid
is the common collision, but not a 90-minute booking at 09:00 racing a 30-minute booking
at 09:15. Those are different starts and a genuine overlap, so the index alone leaves a
real hole. The transaction closes it; the index stays as cheap insurance.

Overlap itself treats bookings as half-open intervals `[Start, End)`, so the whole rule is
`a.Start < b.End && b.Start < a.End`. Touching bookings — one ending exactly as the next
begins — do not overlap and are both allowed.

## Consequences

Concurrent booking attempts for the same stylist serialise and the second one waits. At
one salon's volume this is invisible, and the transaction spans one indexed query and one
insert.

Correctness here cannot be demonstrated by a unit test. It needs an integration test
issuing two genuinely concurrent requests against a real SQL Server instance, which is why
the test suite cannot run on the EF Core in-memory provider.
