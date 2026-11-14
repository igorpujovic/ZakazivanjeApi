/**
 * The two things an admin does to a booking, and what has to be re-asked afterwards.
 *
 * Both are one `PUT` and a status, so the interesting part is not the request. It is that this
 * screen is one of at least two people looking at the same day: a refusal saying the booking
 * has already been resolved is not an error to report and forget but a sign that the table is
 * out of date, so it is answered by going and asking again.
 *
 * The two differ in exactly one way, and it is a rule from the API's own domain: a cancelled
 * booking **releases the stylist's time** and a completed one does not. `BookingRules` counts
 * Scheduled *and* Completed bookings as occupying a stylist, so only cancelling can free a
 * slot — and only cancelling has any business invalidating the slot grids.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Booking } from '../api/dto'
import { bookingKeys, cancelBooking } from '../booking/bookingApi'
import { messageFor } from '../lib/errorCopy'
import { meansAlreadyResolved } from './adminBookings'
import { adminBookingKeys, completeBooking } from './adminBookingsApi'

/**
 * Everything whose answer may have just changed.
 *
 * `bookings/my` is deliberately absent. It is scoped by the token to the signed-in caller, so
 * an admin resolving somebody else's booking cannot be looking at it — and the client whose
 * booking it is will be told by their own screen asking, which it does on mount.
 */
async function refresh(queryClient: QueryClient, releasesTime: boolean): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminBookingKeys.all }),

    /*
     * The hour just given back. Marked stale rather than refetched — `refetchType: 'none'` —
     * because no slot grid is mounted on this screen, so there is nothing to refetch yet and
     * `/book` re-asks when it is next opened.
     */
    ...(releasesTime
      ? [queryClient.invalidateQueries({ queryKey: bookingKeys.slots, refetchType: 'none' })]
      : []),
  ])
}

/** One resolution in flight: which booking, and why the last one was refused. */
interface Resolution {
  run: (bookingId: number) => void
  clear: () => void
  pendingId: number | undefined
  error: string | undefined
}

interface Resolving {
  resolve: (bookingId: number) => Promise<Booking>

  /**
   * Whether this resolution gives the stylist's hour back, which decides whether the slot
   * grids have been made stale. Named rather than positional because `true` at a call site
   * would say nothing about which of the two domain facts it stands for.
   */
  releasesTime: boolean

  /** Run once the API has agreed, before anything is re-asked. */
  onResolved?: () => void
}

/**
 * One resolution: cancel, or complete.
 *
 * The shared part is the refusal. `meansAlreadyResolved` is what turns "somebody got there
 * first" into a refetch, so the row stops offering an action nobody can take — and the message
 * is the API's own `detail`, which already says the booking has been resolved.
 */
function useResolve({ resolve, releasesTime, onResolved }: Resolving): Resolution {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: resolve,

    onSuccess: async () => {
      setError(undefined)
      onResolved?.()
      await refresh(queryClient, releasesTime)
    },

    onError: async (cause) => {
      setError(messageFor(cause))
      if (meansAlreadyResolved(cause)) await refresh(queryClient, releasesTime)
    },
  })

  return {
    run: (bookingId) => mutation.mutate(bookingId),
    clear: () => setError(undefined),

    /** Which booking is in flight, so one row can say so without disabling every other row. */
    pendingId: mutation.isPending ? mutation.variables : undefined,
    error,
  }
}

export interface AdminBookingActions {
  /** Which booking the cancellation is being confirmed for, if any. */
  asking: number | undefined
  askCancel: (bookingId: number) => void
  dismissCancel: () => void
  confirmCancel: () => void

  /** Why the cancellation was refused, shown inside the dialog that asked. */
  cancelError: string | undefined

  complete: (bookingId: number) => void

  /**
   * Which booking each action is waiting on. Both are an id rather than a flag, because a
   * completion is per row — one row saying "Working…" must not disable the other twenty — and
   * a cancellation being one-at-a-time behind a dialog is a fact about the dialog, not a reason
   * for the two to be shaped differently here.
   */
  cancellingId: number | undefined
  completingId: number | undefined

  /** Why the completion was refused. There is no dialog, so the page shows it. */
  completeError: string | undefined
}

export function useAdminBookingActions(): AdminBookingActions {
  const [asking, setAsking] = useState<number | undefined>(undefined)

  /*
   * Cancelling frees the stylist's hour; completing does not. See this module's header.
   *
   * The question closes once it has been answered, and only then: a refusal leaves the dialog
   * up with the reason inside it, because a dialog that vanished leaving an apparently
   * unchanged row would tell a receptionist nothing.
   */
  const cancelling = useResolve({
    resolve: cancelBooking,
    releasesTime: true,
    onResolved: () => setAsking(undefined),
  })

  const completing = useResolve({ resolve: completeBooking, releasesTime: false })

  return {
    asking,

    askCancel: (bookingId) => {
      cancelling.clear()
      completing.clear()
      setAsking(bookingId)
    },

    /*
     * No guard on the request being in flight. Not being dismissable mid-request is a property
     * of `ConfirmDialog`, which disables both its buttons and refuses `Escape` and an outside
     * press — so the rule lives in one place rather than being half-kept in two.
     */
    dismissCancel: () => {
      cancelling.clear()
      setAsking(undefined)
    },

    confirmCancel: () => {
      if (asking !== undefined) cancelling.run(asking)
    },

    cancellingId: cancelling.pendingId,
    cancelError: cancelling.error,

    complete: (bookingId) => {
      cancelling.clear()
      completing.run(bookingId)
    },

    completingId: completing.pendingId,
    completeError: completing.error,
  }
}
