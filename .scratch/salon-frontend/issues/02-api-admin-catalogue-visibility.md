# 02 - API: let an admin see and restore inactive catalogue rows

Status: ready-for-agent
Type: task

Spec: `../spec.md`

`GET /api/services` and `GET /api/stylists` return active rows only, there is no
`includeInactive`, and no route sets a service's `IsActive` back to true — `DELETE` sets it
false "and nothing else". So an admin can create a service, deactivate it, and then never see or
recover it again. That is not a frontend styling problem: the API cannot express the admin's
view of the **catalogue** at all, and the admin screens in issue 08 are incoherent without it.

Stylists are half-solved already, since `PUT /api/stylists/{id}` carries the flag — they still
cannot be *listed* once inactive.

## Scope

- `?includeInactive=true` on `GET /api/services` and `GET /api/stylists`. **Admin only**: a
  caller without the `Admin` role passing it gets the active-only list, or a `403` — decide and
  document which, consistently across both routes.
- `IsActive` on `UpdateServiceRequest`, so `PUT /api/services/{id}` can restore a service. The
  stylist update already does this.
- The default for both lists is unchanged: anonymous and client callers see active rows only.
  The public contract does not move.
- `GET /api/services/{id}` already returns an inactive service by id and needs no change — it is
  what the admin edit panel loads from.
- OpenAPI: the new parameter documented, including that it is admin-only, so the generated
  frontend types pick it up.
- Update the endpoint tables in `README.md` and `../salon-booking/spec.md`, and note the
  deviation from the source specification the way the existing ones are noted.

## Done when

- An admin calling `GET /api/services?includeInactive=true` sees deactivated services; the same
  call without the flag does not.
- A client or anonymous caller cannot widen the list, whichever way that is enforced.
- `PUT /api/services/{id}` with `isActive: true` puts a withdrawn service back on the menu, and
  it then appears in the public list and can be booked.
- Restoring a service does not touch the bookings made against it while it was inactive.
- Integration tests cover the role gate on both routes and the service round-trip
  active → inactive → active.
- ADR-0012 is written in issue 09 covering why one route answers differently by role.
