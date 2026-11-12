# 06 - Booking endpoints, concurrency, integration tests

Status: ready-for-agent
Type: task
Blocked by: 04, 05

Spec: `../spec.md`

The five booking endpoints, plus the part that is genuinely hard: making the overlap rule
hold under concurrency.

## Scope

- `POST /api/bookings` - client. Runs every rule from issue 04, then writes the
  **snapshot** fields: `End`, `PriceAtBooking`, `ServiceNameAtBooking` (ADR-0003). The
  `UserId` comes from the token, never from the request body.
- `GET /api/bookings/my` - client, own bookings only.
- `PUT /api/bookings/{id}/cancel` - **client or admin** (ADR-0004). A client may cancel
  only their own and only before the deadline; an admin may cancel anything at any time.
- `GET /api/bookings?date=&stylistId=&page=&pageSize=` - admin, paginated envelope
  `{ items, page, pageSize, totalCount, totalPages }`, defaults `1`/`20`, `pageSize`
  capped at 100, ordered by `Start` then `Id`.
- `PUT /api/bookings/{id}/complete` - admin, and only once `Start` has passed.
- Status transitions enforced in one place per the spec's table. An illegal transition is
  `409`, not `400` - the request is fine, the state is wrong.
- **Concurrency (ADR-0005):** the overlap query and the insert run inside a single
  `Serializable` transaction. Catch the filtered-unique-index violation and surface `409`
  with code `booking_overlap`, never a raw `500`.

## Tests

Integration, via `WebApplicationFactory` against LocalDB. A uniquely-named database per
run, migrated at start, dropped at the end - **not** a transaction-rollback-per-test
wrapper, which would deadlock the concurrency test.

- **The race:** two genuinely concurrent `POST`s for the same stylist and start. Exactly
  one `201`, exactly one `409`, and exactly one row in the database. This is the test the
  whole serializable-transaction decision exists for.
- A client cancelling someone else's booking gets `403` (or `404` - pick one and be
  consistent; `404` leaks less).
- Cancelling 1h59m before start fails for a client and succeeds for an admin.
- Completing a future booking fails; completing one whose `Start` has passed succeeds.
- Cancelling an already-cancelled booking returns `409`.
- Register through to cancel, end to end.

## Done when

All of the above pass, and no booking endpoint contains time arithmetic of its own - it
all lives in `Domain/` from issue 04.
