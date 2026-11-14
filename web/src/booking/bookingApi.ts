/**
 * Asking when a client can come in, and taking the booking.
 *
 * Two calls, and the interesting thing about them is what they deliberately are *not*: there
 * is no pre-check between them. Refetching to confirm a slot is still free would narrow the
 * race window, guarantee nothing, and teach the one misconception the glossary exists to
 * kill — that a slot is reservable. A slot is an offer. The POST is where it is settled, and
 * `booking_overlap` is the answer when someone was faster.
 */

import { queryOptions } from '@tanstack/react-query'

import { api } from '../api/client'
import type { AvailableSlots, Booking, CreateBookingBody } from '../api/dto'
import type { WallClockDate } from '../lib/wallClock'

export interface SlotsFor {
  stylistId: number
  serviceId: number
  date: WallClockDate
}

export const bookingKeys = {
  /**
   * The root every slots query hangs off, so one invalidation reaches the whole fan-out
   * without the caller having to know which stylists were asked.
   */
  slots: ['slots'] as const,

  /** One stylist's answer for one day and service. */
  slotsFor: (target: SlotsFor) => ['slots', target] as const,

  /** `bookings/my`, named here because the booking page invalidates it on success. */
  mine: ['bookings', 'my'] as const,
}

/**
 * One stylist's free starts for one day and service.
 *
 * Empty is a real answer, not an error — a closed weekday, a retired stylist, a withdrawn
 * service, a day already over or a day that is simply full. The API is explicit about that
 * and the grid renders it as the answer it is.
 *
 * The query parameters are `Date` and `ServiceId`, capitalised as `AvailableSlotsQuery`
 * declares them in C# and as the generated types therefore spell them.
 */
export function availableSlotsQuery(target: SlotsFor) {
  const { stylistId, serviceId, date } = target

  return queryOptions({
    queryKey: bookingKeys.slotsFor(target),
    queryFn: ({ signal }) =>
      api.get<AvailableSlots>(
        `/stylists/${stylistId}/available-slots`,
        { query: { Date: date, ServiceId: serviceId }, signal },
      ),
  })
}

export function createBooking(body: CreateBookingBody): Promise<Booking> {
  return api.post<Booking>('/bookings', body)
}
