/**
 * A client's own bookings: the two things they are, and the one action they have.
 *
 * Pure, and it is worth saying why, because `/bookings` is otherwise a list. Two questions on
 * that screen are genuinely arithmetic — which side of now a booking falls on, and whether the
 * **Cancellation Deadline** has passed — and both are the kind of thing that is wrong at the
 * boundary or wrong in a timezone. Settling them here means `myBookings.test.ts` can ask about
 * the minute either side of the deadline directly, instead of a page test trying to.
 */

import type { Booking } from '../api/dto'
import { isAfter, isBefore, minutesBetween, type WallClock } from '../lib/wallClock'

/**
 * The client's half of the **Cancellation Deadline**: two hours before the start.
 *
 * Mirrored from `ZakazivanjeApi/Domain/BookingRules.cs`
 * (`ClientCancellationDeadline = TimeSpan.FromHours(2)`), and a mirror only — the API is the
 * authority and refuses a late cancellation itself with `cancellation_too_late`. This number
 * exists so the screen can avoid *offering* an action that is certain to be refused, never to
 * decide whether one is allowed. It binds clients only — an admin may cancel at any time
 * (`GLOSSARY.md`, ADR-0004), which is the admin screen's business and not this one's.
 */
export const CANCELLATION_DEADLINE_MINUTES = 120

export interface BookingGroups {
  /** Still to come, soonest first — the next appointment at the top, where it belongs. */
  upcoming: readonly Booking[]
  /** Already over, most recent first, so the last visit is the one nearest the fold. */
  past: readonly Booking[]
}

/**
 * Two groups out of one list.
 *
 * The line is the booking's **end**, not its start: a client sitting in the chair at half past
 * ten has not had a past appointment, and the only honest place for a booking in progress is
 * at the top with the ones still to come.
 *
 * A cancelled booking still dated next week stays in `upcoming` too. It is partitioned purely
 * on time, so nothing with a future date can ever appear under a heading that says Past — the
 * badge is what says it will not happen, and the row carries no actions.
 *
 * `now` is passed in rather than read: the deadline arithmetic beside it has to be testable at
 * the minute, and `nowWallClock` is in any case only the browser's approximation of the
 * salon's clock (see `wallClock.ts`).
 */
export function groupByWhen(bookings: readonly Booking[], now: WallClock): BookingGroups {
  const upcoming: Booking[] = []
  const past: Booking[] = []

  for (const candidate of bookings) {
    ;(isBefore(candidate.end, now) ? past : upcoming).push(candidate)
  }

  /*
   * Both groups are ordered here rather than inherited from the API.
   *
   * `GET /api/bookings/my` does answer `Start` then `Id` ascending, so `upcoming` would come
   * out right by doing nothing — but that would make this function's output order a property
   * of its input, provable only by reading a C# `OrderBy`. Sorting makes it a claim this
   * module owns and its tests can hold it to, which is why they hand it a scrambled list.
   *
   * `past` is the one that genuinely needs the work: most recent first, so the last visit is
   * the one nearest the fold rather than the oldest appointment in the client's history.
   */
  upcoming.sort(bySoonest)
  past.sort((a, b) => bySoonest(b, a))

  return { upcoming, past }
}

const bySoonest = (a: Booking, b: Booking): number =>
  isBefore(a.start, b.start) ? -1 : isAfter(a.start, b.start) ? 1 : a.id - b.id

/**
 * Whether this screen may offer to call a booking off, and if not, whether that is worth
 * explaining.
 *
 * `offered` — the only case with a button.
 *
 * `too-late` — Scheduled, still to happen, but inside the deadline. The API would answer
 * `cancellation_too_late`, so the button is not offered and the screen says why: a client
 * looking at tomorrow morning's appointment and finding no way to call it off deserves a
 * sentence rather than a gap.
 *
 * `none` — nothing to offer and nothing to explain. Two situations reach it, and they look the
 * same to a client. One is a booking that is not Scheduled: terminal is terminal, and the API
 * refuses the transition before it ever looks at the clock. The test is on `Scheduled` rather
 * than on the two known endings because `BookingResponse.status` is typed `string` — OpenAPI
 * carries no enum for it — so a status this build has never heard of is a shape the API could
 * really send, and the safe reading of one is that there is nothing here to offer. The other
 * is a booking that is simply over: a `Scheduled` appointment from last June is a no-show the
 * salon never got round to closing (`GLOSSARY.md`), and telling somebody to ring up about
 * cancelling it would be nonsense.
 */
export type CancelOffer = 'offered' | 'too-late' | 'none'

export function cancelOffer(booking: Booking, now: WallClock): CancelOffer {
  if (booking.status !== 'Scheduled') return 'none'
  if (isBefore(booking.end, now)) return 'none'

  // `>=` because the API's gate is `Now <= start - deadline`: exactly two hours out is still
  // in time, and an off-by-one here would hide the button from someone entitled to it.
  return minutesBetween(now, booking.start) >= CANCELLATION_DEADLINE_MINUTES
    ? 'offered'
    : 'too-late'
}
