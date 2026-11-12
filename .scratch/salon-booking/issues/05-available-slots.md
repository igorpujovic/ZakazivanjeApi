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
