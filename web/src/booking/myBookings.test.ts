import { describe, expect, it } from 'vitest'

import { asWallClock } from '../lib/wallClock'
import { booking } from '../test/apiMocks'
import { cancelOffer, groupByWhen } from './myBookings'

/**
 * A client's own bookings: which side of now each one falls on, and whether the
 * **Cancellation Deadline** still leaves them anything to do about it.
 *
 * Tested against data rather than through the screen because both questions are arithmetic,
 * and arithmetic is wrong at boundaries. The suite runs under a forced `TZ` of Asia/Kolkata —
 * a half-hour offset — so anything that quietly went through a browser-local `Date` on the way
 * here fails loudly. What the screen does with these answers is `myBookingsPage.test.tsx`.
 */

const at = asWallClock

/** One booking, identified by its id, running between two wall-clock times. */
const from = (id: number, start: string, end: string, status = 'Scheduled') =>
  booking({ id, start: at(start), end: at(end), status })

describe('groupByWhen', () => {
  const NOW = at('2026-11-14T12:00:00')

  /**
   * Handed deliberately out of order. The API answers `Start` then `Id` ascending, so a list
   * in the API's own order would not tell us whether anything here sorts at all — `upcoming`
   * would come out right by accident.
   */
  it('puts what is still to come first, soonest first, and what has finished below, most recent first', () => {
    const { upcoming, past } = groupByWhen(
      [
        from(4, '2026-11-25T09:00:00', '2026-11-25T10:00:00'),
        from(2, '2026-11-12T09:00:00', '2026-11-12T10:00:00'),
        from(3, '2026-11-20T09:00:00', '2026-11-20T10:00:00'),
        from(1, '2026-11-10T09:00:00', '2026-11-10T10:00:00'),
      ],
      NOW,
    )

    expect(upcoming.map((row) => row.id)).toEqual([3, 4])
    expect(past.map((row) => row.id)).toEqual([2, 1])
  })

  it('keeps a booking under way at the top, because sitting in the chair is not the past', () => {
    const inProgress = from(9, '2026-11-14T11:30:00', '2026-11-14T12:30:00')

    const { upcoming, past } = groupByWhen([inProgress], NOW)

    expect(upcoming.map((row) => row.id)).toEqual([9])
    expect(past).toEqual([])
  })

  it('keeps a cancelled booking that is still in the future above, where its date says it is', () => {
    const calledOff = from(11, '2026-11-20T09:00:00', '2026-11-20T10:00:00', 'Cancelled')

    const { upcoming } = groupByWhen([calledOff], NOW)

    expect(upcoming.map((row) => row.id)).toEqual([11])
  })

  it('orders a shared start by id, so the same two bookings never swap places between renders', () => {
    const { upcoming } = groupByWhen(
      [
        from(8, '2026-11-20T09:00:00', '2026-11-20T10:00:00'),
        from(4, '2026-11-20T09:00:00', '2026-11-20T09:30:00'),
      ],
      NOW,
    )

    expect(upcoming.map((row) => row.id)).toEqual([4, 8])
  })
})

describe('cancelOffer', () => {
  const START = '2026-11-20T09:00:00'
  const scheduled = from(1, START, '2026-11-20T10:00:00')

  it('offers the action with more than two hours to go', () => {
    expect(cancelOffer(scheduled, at('2026-11-20T06:30:00'))).toBe('offered')
  })

  /**
   * The API's gate is `Now <= start - deadline`, so the two-hour mark itself is still in time.
   * Hiding the button a minute early would refuse someone an action the salon allows them.
   */
  it('still offers it at exactly two hours, which is the side of the deadline the API allows', () => {
    expect(cancelOffer(scheduled, at('2026-11-20T07:00:00'))).toBe('offered')
  })

  it('withholds it a minute later, rather than offering a request certain to be refused', () => {
    expect(cancelOffer(scheduled, at('2026-11-20T07:01:00'))).toBe('too-late')
  })

  it('withholds it once the booking has started', () => {
    expect(cancelOffer(scheduled, at('2026-11-20T09:30:00'))).toBe('too-late')
  })

  it('offers nothing on a terminal booking, whatever the hour', () => {
    const early = at('2026-11-01T09:00:00')

    expect(cancelOffer(from(2, START, '2026-11-20T10:00:00', 'Cancelled'), early)).toBe('none')
    expect(cancelOffer(from(3, START, '2026-11-20T10:00:00', 'Completed'), early)).toBe('none')
  })

  /**
   * `BookingResponse.status` is typed `string` — OpenAPI carries no enum for it — so a status
   * this build has never heard of is a shape the API could really send. It must not come out
   * as an action: a booking we cannot classify is not one to offer to cancel.
   */
  it('offers nothing on a status it does not recognise', () => {
    expect(
      cancelOffer(from(4, START, '2026-11-20T10:00:00', 'Rescheduled'), at('2026-11-01T09:00:00')),
    ).toBe('none')
  })

  /**
   * A `Scheduled` booking from last June is a no-show the salon never closed out — the glossary
   * is explicit that it stays `Scheduled` until an admin cancels it after the fact. It is past
   * the deadline, but saying "please call the salon" about it would be nonsense: there is
   * nothing to call about and nothing for the client to do.
   */
  it('says nothing at all about a booking that is simply over', () => {
    expect(cancelOffer(from(5, START, '2026-11-20T10:00:00'), at('2027-02-01T09:00:00'))).toBe(
      'none',
    )
  })
})
