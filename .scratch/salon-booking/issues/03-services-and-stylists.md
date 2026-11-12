# 03 - Services and stylists: CRUD with soft delete

Status: ready-for-agent
Type: task
Blocked by: 02

Spec: `../spec.md`

The catalogue. Seven of the sixteen endpoints.

## Scope

- `GET /api/services` - public, **active services only**.
- `GET /api/services/{id}` - public, resolves an inactive service too, so historical
  bookings still render.
- `POST`, `PUT`, `DELETE /api/services/{id}` - admin only. `DELETE` sets `IsActive = false`
  and returns `204`; it never removes the row (ADR-0004).
- `GET /api/stylists` - public, active only.
- `POST`, `PUT /api/stylists/{id}` - admin only. `PUT` is also how a stylist is
  deactivated.
- DataAnnotations on the request DTOs: name required, `DurationMinutes` positive, `Price`
  non-negative.
- Separate request and response DTOs throughout. Entities are never returned.

## Done when

- A deactivated service disappears from the list endpoint but is still fetchable by id.
- Deactivating a service leaves its existing bookings untouched and still `Scheduled`
  (ADR-0004).
- A client token gets `403` on every admin route; no token gets `401`.
- An unknown id returns `404`, not an unhandled null.
- Invalid input returns `400` with per-field details.
