/**
 * The admin bookings screen, as arithmetic.
 *
 * `GET /api/bookings` is the one paginated endpoint in the API and this screen is its only
 * caller, which makes a handful of small decisions this module's own: which day a bare address
 * means, which rows a page covers, and what is left to do about a row. None of them needs
 * React, and every one of them is the kind of thing that is wrong at a boundary — a page edge,
 * the minute a booking starts — so none of them is decided while rendering.
 */

import { isApiError } from '../api/errors'
import { asChosenDate, asChosenId } from '../booking/selection'
import type { Booking, PagedBookings } from '../api/dto'
import { isBefore, type WallClock, type WallClockDate } from '../lib/wallClock'

/**
 * The whole-history view: every booking the salon has ever taken, which is what the endpoint
 * answers when given no day at all.
 *
 * A token in the address rather than an absent parameter, because absent already means
 * something else here — "no day chosen", which defaults to today. It cannot be mistaken for a
 * day, `all` being nothing a `WallClockDate` can ever be.
 */
export const ALL_DAYS = 'all'

/** The day a screen is showing: one of them, or all of them. */
export type Day = WallClockDate | typeof ALL_DAYS

/** Which bookings the screen is asking the API for. */
export interface AdminFilters {
  day: Day

  /** One stylist's day, or the whole salon's. */
  stylistId: number | undefined

  /** Counting from one, as `BookingsQuery.FirstPage` does and as a person counts pages. */
  page: number

  /**
   * How many rows to ask for, when the address says.
   *
   * There is no control for this and it is not meant to be typed by a receptionist. It exists
   * because the API **caps** the size at a hundred rather than refusing it, and the response
   * then reports the size actually used — so the only way to see this screen report that
   * rather than what it asked for is for an absurd size to be askable.
   */
  pageSize?: number
}

/**
 * The filters an address describes.
 *
 * `today` is passed in rather than read, so the default is a claim this module's tests can
 * hold it to rather than a property of the day they happen to run on.
 *
 * Read sceptically, like the booking page's selection: the address is the one piece of this
 * screen's state a person can type, and anything unusable means the same thing as having
 * chosen nothing.
 */
export function filtersFrom(search: string, today: WallClockDate): AdminFilters {
  const params = new URLSearchParams(search)
  const day = params.get('date')

  return {
    /*
     * The default, and the reason this module exists. The endpoint orders by `Start` then `Id`
     * ascending, so a bare call puts the oldest bookings in salon history on page one: the
     * screen has to choose a day rather than pass nothing.
     */
    day: day === ALL_DAYS ? ALL_DAYS : (asChosenDate(day) ?? today),

    stylistId: asChosenId(params.get('stylistId')),

    // `asChosenId` admits positive whole numbers only, which is exactly the endpoint's
    // `[Range(FirstPage, int.MaxValue)]`: page zero is refused there rather than quietly read
    // as the first page, so it is not sent in the first place.
    page: asChosenId(params.get('page')) ?? 1,
    pageSize: asChosenId(params.get('pageSize')),
  }
}

/**
 * The query string for a set of filters, without its leading `?`.
 *
 * The day is always written, even when it is today: that is what makes a pasted link restore
 * the day it was copied on rather than the day it is opened on, which is the one thing an
 * absent parameter could not express. Everything else is absent at its default, so an address
 * carries only the choices somebody actually made.
 */
export function searchFor(filters: AdminFilters): string {
  const params = new URLSearchParams()

  params.set('date', filters.day)
  if (filters.stylistId !== undefined) params.set('stylistId', String(filters.stylistId))
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))

  return params.toString()
}

/** What the footer and the two page buttons need, and nothing the screen would have to add. */
export interface PageView {
  page: number
  totalPages: number
  totalCount: number

  /** This page holds no rows: the salon has none matching, or the page is past the end. */
  isEmpty: boolean

  /**
   * Where the two page buttons go, or `undefined` for a button with nowhere to send anybody.
   *
   * Destinations rather than two booleans, because for a page past the end they are not
   * `page ± 1`: the way back from a pasted `?page=99` of eight is page **eight**, not
   * ninety-eight, which would be just as empty and ninety clicks from anything.
   */
  previous: number | undefined
  next: number | undefined

  /** One line naming the rows on screen out of the total, in the salon's own words. */
  summary: string
}

/**
 * A page, read entirely off the response.
 *
 * Nothing here takes the filters, and that is the point rather than an omission. The API caps
 * `PageSize` at a hundred **rather than refusing it**, so what was asked for and what was used
 * can differ — and the response is the only one of the two that says what is actually on
 * screen. A footer computed from the request would claim "1–500" over a hundred rows.
 */
export function pageView(response: PagedBookings): PageView {
  const { page, pageSize, totalCount, totalPages, items } = response

  const from = (page - 1) * pageSize + 1

  /*
   * The end of the range comes from the rows that arrived, not from the page size: the last
   * page is short, and `page * pageSize` would have it reporting rows that are not there.
   */
  const to = from + items.length - 1
  const isEmpty = items.length === 0

  return {
    page,
    totalPages,
    totalCount,
    isEmpty,

    /*
     * Clamped into the pages that exist, which is what makes the way back out of a page past
     * the end one click rather than ninety. `Math.max(1, …)` covers the day with no bookings
     * at all, where `totalPages` is zero and the only sane destination is the first page.
     */
    previous: page > 1 ? Math.max(1, Math.min(page - 1, totalPages)) : undefined,
    next: page < totalPages ? page + 1 : undefined,

    summary: isEmpty
      ? totalCount === 0
        ? 'No bookings'
        : // A hand-edited or pasted page number past the end. The API answers it with an empty
          // page rather than a refusal, so the screen says what happened — and `previous`
          // keeps the way back, which is the only useful thing left to offer.
          `Page ${page} of ${totalPages} — there is nothing here`
      : `Showing ${from}–${to} of ${totalCount}`,
  }
}

/**
 * Whether this screen may offer to mark a booking carried out, and if not, whether that is
 * worth explaining.
 *
 * `offered` — the only case with a live button.
 *
 * `not-started` — `Scheduled`, but the start has not arrived. `BookingRules.CheckCompletion`
 * refuses `Now < start` with `booking_not_started`, so this is a request whose answer the
 * screen already knows: the button is not live, and the row says why rather than leaving a
 * receptionist to find out by being refused.
 *
 * `none` — nothing to offer and nothing to explain, because the booking is already resolved.
 * `BookingTransitions` refuses both endings before it ever looks at a clock. The test is on
 * `Scheduled` rather than on the two known endings because `BookingResponse.status` is typed
 * `string` — OpenAPI carries no enum for it — so a status this build has never heard of is a
 * shape the API could really send, and the safe reading of one is that there is nothing here
 * to offer.
 *
 * `now` is passed in rather than read, so the minute either side of a start time is something
 * this module's tests can ask about directly.
 */
export type CompleteOffer = 'offered' | 'not-started' | 'none'

export function completeOffer(booking: Booking, now: WallClock): CompleteOffer {
  if (booking.status !== 'Scheduled') return 'none'

  // `isBefore(now, start)`, mirroring the API's `Now < start`: the start itself counts, and
  // the gate is the **start** and not the end so a stylist finishing early can close the
  // booking out there and then.
  return isBefore(now, booking.start) ? 'not-started' : 'offered'
}

/**
 * Whether this screen may offer to call a booking off.
 *
 * Status, and nothing else — no clock, because an admin has no deadline. ADR-0004: the
 * **Cancellation Deadline** binds clients only, which is what makes a no-show, a sick stylist
 * or an unreachable client something the salon can resolve. A `Scheduled` booking from last
 * June is exactly a no-show the salon never got round to closing, and cancelling it is how
 * that is done.
 *
 * The contrast with `myBookings.ts`' `cancelOffer` is the whole of ADR-0004 in two functions:
 * same endpoint, same booking, different terms by who is asking.
 */
export function canCancel(booking: Booking): boolean {
  return booking.status === 'Scheduled'
}

/**
 * Whether a refusal means somebody else got there first, so what is on screen is out of date.
 *
 * Two codes, and the salon's own explanation for both: two admins looking at the same day.
 * `booking_already_cancelled` and `booking_already_completed` come from `BookingTransitions`,
 * which refuses a booking that has already been resolved — so the row offering the action was
 * showing a status that has since changed, and the useful answer is to go and ask again.
 *
 * Deliberately not copy. Neither code is in {@link HandledErrorCode}, because the API's own
 * `detail` already says the only useful thing — "That booking has already been cancelled." is
 * precisely "someone already did this" — and issue 06's screen is held to proving that
 * fallthrough. What this screen adds is not a better sentence but the **refetch**, and which
 * codes mean "stale" is a fact about the codes rather than words for a person.
 *
 * Nothing else qualifies. A refusal about the request itself says nothing about whether the
 * rest of the day is still accurate, and refetching on anything that went wrong would make an
 * unreachable API a reason to reload the table.
 */
export function meansAlreadyResolved(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.code === 'booking_already_cancelled' || error.code === 'booking_already_completed')
  )
}
