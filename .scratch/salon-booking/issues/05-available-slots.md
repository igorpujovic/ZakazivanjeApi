# 05 - Available slots endpoint

Status: ready-for-agent
Type: task
Blocked by: 03, 04

Spec: `../spec.md`

`GET /api/stylists/{id}/available-slots?date=&serviceId=` - public. Thin: it loads data
and hands it to the slot generator from issue 04.

## Scope

- Validate `date` and `serviceId`; a missing or unparseable `date` is `400`.
- Load the stylist, the service, the weekday's working hours, and that stylist's
  `Scheduled` and `Completed` bookings for the day. **`Cancelled` bookings are excluded**,
  so cancelling genuinely frees the time.
- Call the slot generator. The endpoint itself contains no time arithmetic.
- Return start times with the service duration, so a caller knows what each slot implies.

## Done when

- An unknown stylist or service returns `404`.
- A closed weekday returns an empty list with `200`, not an error.
- An inactive stylist or inactive service returns an empty list, not an error - nothing is
  bookable, which is not the same as nothing existing.
- Asking for today at 14:00 returns no slot before 14:00.
- Cancelling a booking makes its slots reappear on the next call.
- Every start this endpoint returns is accepted by `POST /api/bookings` in issue 06. The
  two must never disagree.

## Comments

Implemented. `GET /api/stylists/{id}/available-slots?date=&serviceId=` lives on
`StylistsController` as one more `[AllowAnonymous]` opt-out of that controller's admin-by-default
guard, and delegates to `ISlotFinder`/`SlotFinder`. The finder loads the stylist, the service and
the day's busy intervals and hands them to `BookingRules.AvailableSlots`; it contains no time
arithmetic, so the only answer to "could this offer a start `POST /api/bookings` would refuse?" is
that both run the same `CheckTiming`.

Covered by `AvailableSlotsEndpointTests` (13 integration tests): the specification's worked
example end to end, `404` for an unknown stylist or service, an empty `200` for a closed weekday,
a retired stylist and a withdrawn service, `400` for a missing or unparseable `date` or
`serviceId`, a cancelled booking's time coming back, a completed booking's time staying occupied,
and the past-start filter.

Three things worth carrying forward:

- Busy bookings are selected by naming `Scheduled` and `Completed` rather than by excluding
  `Cancelled`, so a status added later has to be considered rather than silently occupying time.
  The day filter is `Start < dayEnd && End > dayStart` — overlap, not "starts that day".
- `AvailableSlotsQuery` makes both parameters nullable and `[Required]`, so a missing one is
  reported as the field it is. Had `date` been a non-nullable `DateOnly`, an absent value would
  have bound to `0001-01-01` and answered `200` with an empty day — a typo would look like a
  fully booked salon.
- `SalonApiFactory.CreateClientAt(now)` is new: a second host over the *same* database with a
  `FakeTimeProvider`, used only by the past-start test. It has to be a separate host because a
  clock frozen in another year would break the JWTs the rest of the suite mints, and it is what
  proves the rules read the clock the application hands them rather than `DateTime.Now`.

`BookingRules` is now registered in DI (singleton: validated options plus a clock, nothing
per-request), which issue 06 will also need.

Review turned up one piece of tidying beyond this issue: creating a stylist and creating a
service had been written privately in two test classes and were about to be written a third
time, so both moved to `SalonApiClient`, which exists to stop exactly that drift.
`ServicesEndpointTests` and `StylistsEndpointTests` now call them too.
