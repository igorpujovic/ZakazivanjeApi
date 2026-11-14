/**
 * Asking the API for the salon's whole book, a page at a time.
 *
 * `GET /api/bookings` is the only paginated endpoint in the API and this is its only caller.
 * Two things about it shape this module. It orders by `Start` then `Id` ascending, so a bare
 * call answers with the oldest bookings in salon history — which is why a day belongs in the
 * query rather than being an afterthought. And it **caps** `PageSize` rather than refusing it,
 * so what comes back is the authority on what is being shown; see `pageView`.
 */

import { queryOptions } from '@tanstack/react-query'

import { api } from '../api/client'
import type { Booking, PagedBookings } from '../api/dto'
import { ALL_DAYS, type AdminFilters } from './adminBookings'

export const adminBookingKeys = {
  /**
   * The root every page of the admin list hangs off, so one invalidation reaches whichever day
   * and page is on screen without the caller having to know which that is.
   */
  all: ['bookings', 'all'] as const,

  /** One day, one stylist, one page. */
  list: (filters: AdminFilters) => ['bookings', 'all', filters] as const,
}

/**
 * One page of the whole salon's bookings.
 *
 * The parameters are capitalised as `BookingsQuery` declares them in C# and as the generated
 * types therefore spell them. `EffectivePageSize` appears in those types too and is **not**
 * sent: it is a computed C# property that the OpenAPI document picked up as though it were a
 * query parameter. It is the server's answer about the size it used, not a question a caller
 * gets to ask.
 *
 * A day is sent unless the view is the whole history, which is the one case where asking the
 * endpoint nothing is the right question.
 */
export function adminBookingsQuery(filters: AdminFilters) {
  return queryOptions({
    queryKey: adminBookingKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<PagedBookings>('/bookings', {
        query: {
          Date: filters.day === ALL_DAYS ? undefined : filters.day,
          StylistId: filters.stylistId,

          // The endpoint's own defaults, so a plain first page is a plain request.
          Page: filters.page > 1 ? filters.page : undefined,
          PageSize: filters.pageSize,
        },
        signal,
      }),
  })
}

/**
 * The salon's word that a booking was carried out.
 *
 * Admin only, and refused with `booking_not_started` until the start has passed — which is a
 * refusal this screen is built never to provoke. Answers the updated booking.
 */
export function completeBooking(bookingId: number): Promise<Booking> {
  return api.put<Booking>(`/bookings/${bookingId}/complete`)
}
