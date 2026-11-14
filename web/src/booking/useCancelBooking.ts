/**
 * Calling a booking off, and what has to be re-asked afterwards.
 *
 * Its own module for the same reason `useConfirmBooking` is: the interesting part is not the
 * request but what follows it. Cancelling writes to two things a client can see — their own
 * list, and the stylist's free time — and getting the second one wrong is the kind of bug
 * nobody notices until someone cannot rebook the hour they just gave up.
 *
 * One refusal gets its own words. `cancellation_too_late` is the **Cancellation Deadline**
 * becoming real to somebody, and the API's `detail` does not name it; `errorCopy.ts` does.
 * Everything else falls through to `detail`, which is what the API's README promises it is for.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { messageFor } from '../lib/errorCopy'
import { bookingKeys, cancelBooking } from './bookingApi'

export interface CancelBooking {
  /** Which booking the confirmation is currently about, if any. */
  asking: number | undefined

  /** Ask about one. */
  ask: (bookingId: number) => void

  /** Put the question away, keeping the booking. */
  dismiss: () => void

  /** Go ahead with the booking being asked about. */
  confirm: () => void

  isPending: boolean

  /** Why it was refused, in the words this application has for that code. */
  error: string | undefined
}

export function useCancelBooking(): CancelBooking {
  const queryClient = useQueryClient()

  const [asking, setAsking] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: cancelBooking,

    onSuccess: async () => {
      setAsking(undefined)
      setError(undefined)

      /*
       * Two lists, and the second one is the easy one to forget.
       *
       * `bookings/my` because the row this client is looking at has a new status — and the
       * response carries it, but writing it straight into the cache would leave the rest of
       * the list as whatever it was when the page loaded, which on a screen that was open
       * while the deadline passed is exactly the stale thing.
       *
       * The slots because **cancelling releases the stylist's time**: the hour just given up
       * is free again, and a slot grid still holding the answer from before would go on
       * hiding it. Marked stale rather than refetched — `refetchType: 'none'` — because no
       * grid is mounted on this screen, so there is nothing to refetch yet and `/book` re-asks
       * when it is next opened.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bookingKeys.mine }),
        queryClient.invalidateQueries({ queryKey: bookingKeys.slots, refetchType: 'none' }),
      ])
    },

    /*
     * The question stays open, with the answer inside it.
     *
     * `cancellation_too_late` is the one that matters and the reason: the deadline can pass
     * while this page sits open, so a client who was offered the button in good faith can
     * still be refused. Closing the dialog and leaving a row that looks unchanged would tell
     * them nothing, and `errorCopy.ts` has a sentence that names the two hours and what to do
     * instead.
     */
    onError: (cause) => setError(messageFor(cause)),
  })

  return {
    asking,

    ask: (bookingId) => {
      setError(undefined)
      setAsking(bookingId)
    },

    /*
     * No guard on `isPending` here. Not being dismissable mid-request is a property of the
     * dialog, which disables both its buttons and refuses `Escape` and an outside press while
     * the request is in flight — so the rule lives in one place instead of being half-kept in
     * two, and a reader is not left wondering which of them is load-bearing.
     */
    dismiss: () => {
      setError(undefined)
      setAsking(undefined)
    },

    confirm: () => {
      if (asking !== undefined) mutation.mutate(asking)
    },

    isPending: mutation.isPending,
    error,
  }
}
