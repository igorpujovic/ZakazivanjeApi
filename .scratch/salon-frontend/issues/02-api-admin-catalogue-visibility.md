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

## Comments

**Implemented.** Two notes on what the scope turned out to be.

*The role gate, decided.* A caller without the `Admin` role passing `includeInactive=true` is
**refused**, not quietly served the active-only list: `401` with no token, `403` with a
client's, which is the division every admin route already makes and the one asserted across the
existing endpoint tests. A `401` for an anonymous caller is the honest answer — retrying with an
admin's token works. The reasoning is the API's own position on `BookingsQuery.Page`: answering
a narrower question than the one asked hides both an admin screen holding a stale session and a
client that misread the contract. Enforced in one place, `Services/CatalogueVisibility.cs`, so
the two routes cannot drift; it has to be the action's decision rather than an `[Authorize]`
attribute's, because authorization is settled before the action runs and both routes must stay
open to everyone for the list they answer with by default. Documented in `README.md` and in
`../salon-booking/spec.md`.

*`IsActive` on `UpdateServiceRequest` was already there*, from `6874964 Catalogue: services and
stylists, with soft delete` — the scope above reads as though it were missing. So `PUT
/api/services/{id}` already restored a withdrawn service, and
`Updates_a_service_and_can_put_a_withdrawn_one_back_on_the_menu` already covered it. The round
trip asked for under "Done when" went in as
`Puts_a_restored_service_back_on_offer_without_touching_its_bookings`, which was green on
arrival: it adds that a restored service is bookable again and that both halves of the trip
leave an existing booking alone. Real work left in this ticket: the `includeInactive` flag, its
role gate, and the documentation.

ADR-0012 is still outstanding, as planned, and belongs to issue 09. Everything here references
it already.
