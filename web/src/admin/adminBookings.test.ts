import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/errors'
import { booking, pagedBookings } from '../test/apiMocks'
import { asWallClock, asWallClockDate } from '../lib/wallClock'
import {
  ALL_DAYS,
  canCancel,
  completeOffer,
  filtersFrom,
  meansAlreadyResolved,
  pageView,
  searchFor,
} from './adminBookings'

/**
 * `/admin/bookings`, as arithmetic.
 *
 * Everything here is a decision the screen would otherwise make while rendering, and every one
 * of them is the kind of thing that is wrong at a boundary: which day a bare address means,
 * which rows a page number covers, and whether a booking may still be closed out. Settling
 * them in a module means this file can ask about the minute either side of a start time and
 * the row either side of a page edge, instead of a table test trying to.
 */

/** A Saturday, and never the real clock: the default has to be provably *this* day. */
const TODAY = asWallClockDate('2026-11-14')

/** A refusal as `api/client.ts` would hand one over, with only the code that matters. */
const refusal = (code: string) => new ApiError({ status: 409, code })

describe('the day the screen asks about', () => {
  /**
   * The whole reason this module exists. `GET /api/bookings` orders by `Start` then `Id`
   * ascending, so a bare call lands on the oldest bookings in salon history — the screen has
   * to choose a day rather than pass nothing.
   */
  it('defaults to today when the address names no day', () => {
    expect(filtersFrom('', TODAY).day).toBe('2026-11-14')
  })

  it('shows the day the address names', () => {
    expect(filtersFrom('?date=2026-11-20', TODAY).day).toBe('2026-11-20')
  })

  /**
   * The escape hatch. Distinguishable from a bare address on purpose: absent means "no day
   * chosen", which defaults to today, while `all` is a choice — every booking the salon has
   * ever taken, oldest first, which is what the endpoint does when given no day at all.
   */
  it('shows every booking ever when the day is explicitly cleared', () => {
    expect(filtersFrom('?date=all', TODAY).day).toBe(ALL_DAYS)
  })

  /**
   * The address is the one piece of this screen's state a person can type, so it is read
   * sceptically. Anything unusable means the same as having chosen nothing — which lands a
   * receptionist on today rather than on a complaint about a query string they did not write.
   */
  it('reads a day it cannot use as no day at all', () => {
    expect(filtersFrom('?date=last+tuesday', TODAY).day).toBe('2026-11-14')
    expect(filtersFrom('?date=', TODAY).day).toBe('2026-11-14')
  })
})

describe('the rest of the address', () => {
  it('reads one stylist, and anything unusable as the whole salon', () => {
    expect(filtersFrom('?stylistId=4', TODAY).stylistId).toBe(4)
    expect(filtersFrom('', TODAY).stylistId).toBeUndefined()
    expect(filtersFrom('?stylistId=0', TODAY).stylistId).toBeUndefined()
    expect(filtersFrom('?stylistId=anyone', TODAY).stylistId).toBeUndefined()
  })

  /** Pages count from one, as `BookingsQuery.FirstPage` does and as a person counts them. */
  it('reads the page, counting from one', () => {
    expect(filtersFrom('?page=3', TODAY).page).toBe(3)
    expect(filtersFrom('', TODAY).page).toBe(1)
    expect(filtersFrom('?page=0', TODAY).page).toBe(1)
    expect(filtersFrom('?page=-2', TODAY).page).toBe(1)
  })

  /**
   * The size is in the address and has no control, which is deliberate: the API caps it at a
   * hundred rather than refusing it, and the only way to see the screen report the size that
   * was *used* rather than the one it asked for is to be able to ask for an absurd one.
   */
  it('reads the page size, which only a hand-edited address carries', () => {
    expect(filtersFrom('?pageSize=500', TODAY).pageSize).toBe(500)
    expect(filtersFrom('', TODAY).pageSize).toBeUndefined()
  })
})

describe('writing the address back', () => {
  const day = asWallClockDate('2026-11-20')

  /**
   * The day is always written out, even when it is today. That is what makes a link restore
   * the day it was taken on rather than the day it is opened on — the one thing an absent
   * parameter could not express.
   */
  it('names the day', () => {
    expect(searchFor({ day, stylistId: undefined, page: 1 })).toBe('date=2026-11-20')
  })

  it('names the whole-history view as the choice it is', () => {
    expect(searchFor({ day: ALL_DAYS, stylistId: undefined, page: 1 })).toBe('date=all')
  })

  /** A choice not made is absent, and the first page is not worth saying. */
  it('leaves out the stylist and the page when they are the defaults', () => {
    expect(searchFor({ day, stylistId: 4, page: 3 })).toBe('date=2026-11-20&stylistId=4&page=3')
    expect(searchFor({ day, stylistId: 4, page: 1 })).toBe('date=2026-11-20&stylistId=4')
    expect(searchFor({ day, stylistId: undefined, page: 2, pageSize: 50 })).toBe(
      'date=2026-11-20&page=2&pageSize=50',
    )
  })
})

describe('which rows a page covers', () => {
  /** Twenty rows, which is what a full page of the API's default size holds. */
  const full = Array.from({ length: 20 }, (_, index) => booking({ id: index + 1 }))

  it('counts the first page from one', () => {
    const view = pageView(pagedBookings(full, { page: 1, totalCount: 143, totalPages: 8 }))

    expect(view.summary).toBe('Showing 1–20 of 143')
    expect(view.previous).toBeUndefined()
    expect(view.next).toBe(2)
  })

  it('counts a later page from where the ones before it ended', () => {
    const view = pageView(pagedBookings(full, { page: 4, totalCount: 143, totalPages: 8 }))

    expect(view.summary).toBe('Showing 61–80 of 143')
    expect(view.previous).toBe(3)
    expect(view.next).toBe(5)
  })

  /**
   * The last page is short, and the count comes from the rows that actually arrived rather
   * than from the page size — which is what keeps "141–143 of 143" from reading "141–160".
   */
  it('stops at the rows the last page really holds', () => {
    const view = pageView(
      pagedBookings(full.slice(0, 3), { page: 8, totalCount: 143, totalPages: 8 }),
    )

    expect(view.summary).toBe('Showing 141–143 of 143')
    expect(view.next).toBeUndefined()
  })

  /**
   * The cap, which is the whole reason a page size can be asked for at all. The request said
   * five hundred; the API answered with a hundred and said so. The screen reports the hundred
   * — a footer claiming "1–500" over a hundred rows would be the lie this test exists to stop.
   */
  it('reports the page size the API used, not the one that was asked for', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => booking({ id: index + 1 }))

    const view = pageView(
      pagedBookings(hundred, { page: 1, pageSize: 100, totalCount: 143, totalPages: 2 }),
    )

    expect(view.summary).toBe('Showing 1–100 of 143')
    expect(view.next).toBe(2)
  })

  it('says so when the salon has no bookings matching at all', () => {
    const view = pageView(pagedBookings([], { totalCount: 0, totalPages: 0 }))

    expect(view.summary).toBe('No bookings')
    expect(view.isEmpty).toBe(true)
    expect(view.previous).toBeUndefined()
    expect(view.next).toBeUndefined()
  })

  /**
   * A pasted or hand-edited page number past the end. The API answers it happily with an empty
   * page, so the screen has to say what happened and offer a way back that is worth taking:
   * page eight, the last one with anything on it, rather than page ninety-eight. The one
   * thing it must not do is report a range starting after the total.
   */
  it('says a page past the end is past the end, and keeps the way back', () => {
    const view = pageView(pagedBookings([], { page: 99, totalCount: 143, totalPages: 8 }))

    expect(view.summary).toBe('Page 99 of 8 — there is nothing here')
    expect(view.isEmpty).toBe(true)
    expect(view.previous).toBe(8)
    expect(view.next).toBeUndefined()
  })
})

describe('closing a booking out', () => {
  const now = asWallClock('2026-11-14T12:00:00')

  const at = (start: string, end: string, status = 'Scheduled') =>
    booking({ start: asWallClock(start), end: asWallClock(end), status })

  /**
   * The gate the screen exists to respect. `BookingRules.CheckCompletion` refuses
   * `Now < start` with `booking_not_started`, so a booking yet to start is a request this
   * screen already knows the answer to and does not send.
   */
  it('is not offered before the booking has started', () => {
    expect(completeOffer(at('2026-11-14T12:01:00', '2026-11-14T13:00:00'), now)).toBe(
      'not-started',
    )
  })

  /** The minute it starts. The API's test is `Now < start`, so the start itself counts. */
  it('is offered from the start time itself', () => {
    expect(completeOffer(at('2026-11-14T12:00:00', '2026-11-14T13:00:00'), now)).toBe('offered')
  })

  /**
   * Gated on the start and not the end, so a stylist who finishes early can close the booking
   * out there and then rather than waiting for an hour that is already paid for.
   */
  it('is offered while the booking is still under way', () => {
    expect(completeOffer(at('2026-11-14T11:00:00', '2026-11-14T13:00:00'), now)).toBe('offered')
  })

  /**
   * Terminal is terminal, and `BookingTransitions` refuses both before it ever looks at a
   * clock. The test is on `Scheduled` rather than on the two known endings because
   * `BookingResponse.status` is typed `string` — a status this build has never heard of is a
   * shape the API could really send, and the safe reading of one is that there is nothing to
   * offer.
   */
  it('is not offered on a booking that has already been resolved', () => {
    expect(completeOffer(at('2026-11-14T09:00:00', '2026-11-14T10:00:00', 'Completed'), now))
      .toBe('none')
    expect(completeOffer(at('2026-11-14T09:00:00', '2026-11-14T10:00:00', 'Cancelled'), now))
      .toBe('none')
    expect(completeOffer(at('2026-11-14T09:00:00', '2026-11-14T10:00:00', 'Rescheduled'), now))
      .toBe('none')
  })
})

describe('calling a booking off as the salon', () => {
  /**
   * ADR-0004: the **Cancellation Deadline** binds clients only. A booking starting in ten
   * minutes is inside the two hours that would refuse a client, and an admin may still call it
   * off — which is what makes a sick stylist or an unreachable client something the salon can
   * resolve. The row takes no clock at all, so there is no deadline here to get wrong.
   */
  it('is offered however close the booking is', () => {
    expect(canCancel(booking({ start: asWallClock('2026-11-14T12:10:00') }))).toBe(true)
  })

  /** A no-show from last June: still `Scheduled`, and cancelling it is how the salon resolves one. */
  it('is offered on a booking that has already passed', () => {
    expect(canCancel(booking({ start: asWallClock('2020-06-01T09:00:00') }))).toBe(true)
  })

  it('is not offered on a booking that has already been resolved', () => {
    expect(canCancel(booking({ status: 'Cancelled' }))).toBe(false)
    expect(canCancel(booking({ status: 'Completed' }))).toBe(false)
  })
})

describe('a refusal that means the screen is out of date', () => {
  /**
   * Two admins on the same day is the obvious cause, and the useful thing to do about it is
   * not a sentence — the API's `detail` already says the booking has been resolved — but to
   * go and ask again, so the row stops showing an action nobody can take.
   */
  it('recognises a booking somebody else resolved first', () => {
    expect(meansAlreadyResolved(refusal('booking_already_cancelled'))).toBe(true)
    expect(meansAlreadyResolved(refusal('booking_already_completed'))).toBe(true)
  })

  /**
   * Everything else leaves the screen alone. A refusal about *this* request — the start not
   * having arrived — says nothing about whether the rest of the day is still accurate, and
   * refetching on anything that goes wrong would make a flat network a reason to reload the
   * table.
   */
  it('leaves the screen alone for anything else', () => {
    expect(meansAlreadyResolved(refusal('booking_not_started'))).toBe(false)
    expect(meansAlreadyResolved(refusal('http_500'))).toBe(false)
    expect(meansAlreadyResolved(new Error('the salon could not be reached'))).toBe(false)
  })
})
