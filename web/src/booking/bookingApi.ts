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

/**
 * The signed-in client's own bookings, all of them, past included.
 *
 * Scoped by the token, not by a parameter: `GET /api/bookings/my` reads the caller's id from
 * the JWT, so there is no client id to pass and none to get wrong. Which is also why nothing
 * here filters by `clientId` afterwards — the answer *is* this client's bookings, and a second
 * filter in the browser would be a weaker copy of a rule the API already enforces where it
 * cannot be bypassed.
 *
 * Ordered `Start` then `Id` ascending by the API, which puts the oldest appointment in the
 * client's history first. `myBookings.ts` splits that into the two groups the screen shows.
 */
export function myBookingsQuery() {
  return queryOptions({
    queryKey: bookingKeys.mine,
    queryFn: ({ signal }) => api.get<Booking[]>('/bookings/my', { signal }),
  })
}

/**
 * Call a booking off.
 *
 * `PUT .../cancel`, not `DELETE`: the booking survives, with `Cancelled` as its status — which
 * a client can still see, and which releases the stylist's time. ADR-0004, and the reason the
 * UI never says "delete" here either.
 *
 * Answers the updated booking, so the row's new status comes back with the response rather
 * than needing a refetch to be believed.
 */
export function cancelBooking(bookingId: number): Promise<Booking> {
  return api.put<Booking>(`/bookings/${bookingId}/cancel`)
}
