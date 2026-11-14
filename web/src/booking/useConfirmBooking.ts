/**
 * Confirming a slot, and the five ways that can go wrong.
 *
 * Its own module because the recoveries *are* the interesting part of the booking page, and
 * burying them among three controls and a grid would hide the one thing a reader came to see.
 * `errorCopy.ts` decides what a refusal is called and which recovery it calls for; this hook
 * performs that recovery and nothing else.
 *
 * What the five have in common is that the service, the stylist and the day all survive. The
 * alternative to the time that just went is one tap away, and making someone re-enter three
 * choices to reach it would be punishing them for the salon being busy.
 *
 * There is no pre-check before the post. Refetching to see whether a slot is still free would
 * narrow the race window, guarantee nothing, and treat a slot as reservable — the one
 * misconception `GLOSSARY.md` exists to kill. The race is run, and then recovered from.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { isApiError } from '../api/errors'
import { copyFor, messageFor } from '../lib/errorCopy'
import { catalogueKeys } from '../catalogue/catalogue'
import { bookingKeys, createBooking } from './bookingApi'
import type { Slot } from './slots'

/** What the visitor is told, and whether pressing the same button again could help. */
export interface Notice {
  message: string
  canRetry: boolean
}

export interface ConfirmBooking {
  /** Send a pick. The service is the one the slot was offered for. */
  confirm: (slot: Slot, serviceId: number) => void

  /** In flight, so the grid and both buttons can refuse a second tap. */
  isPending: boolean

  notice: Notice | undefined

  /** Clear the notice — the visitor has moved on by changing a control or picking again. */
  dismiss: () => void

  /**
   * Whether the pick the refusal was about is still worth holding on to.
   *
   * Only `booking_contended` says yes, and that is the whole point of offering a retry: the
   * API wrote nothing and asked for another go, so there is nothing to re-enter. Every other
   * refusal means the pick is gone, and keeping it selected would be offering a time that no
   * longer exists.
   */
  keepsPick: boolean
}

export function useConfirmBooking({ onBooked }: { onBooked: () => void }): ConfirmBooking {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [keepsPick, setKeepsPick] = useState(false)

  const mutation = useMutation({
    mutationFn: createBooking,

    onSuccess: async () => {
      setNotice(undefined)
      setKeepsPick(false)

      /*
       * Both lists are now stale: the grid this client just took a slot out of, and their own
       * bookings, which they are about to be looking at.
       *
       * The slots are marked stale without being refetched — `refetchType: 'none'` — because
       * the grid is about to unmount on the way to `/bookings`, and refetching a screen nobody
       * will see is a round trip spent on nothing. Coming back to `/book` re-asks.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bookingKeys.slots, refetchType: 'none' }),
        queryClient.invalidateQueries({ queryKey: bookingKeys.mine }),
      ])

      onBooked()
    },

    onError: async (error) => {
      // A refusal we have words for brings its own recovery. Anything else — unreachable, or
      // unforeseen — leaves it unknown whether anything was written, and trying again is the
      // only sensible offer.
      const recovery = isApiError(error) ? copyFor(error).recovery : 'retry'

      setNotice({ message: messageFor(error), canRetry: recovery === 'retry' })
      setKeepsPick(recovery === 'retry')

      switch (recovery) {
        // `booking_overlap` and `start_in_past`. Re-ask, and the time disappears from the grid
        // on its own — which is a better account of what happened than any sentence.
        case 'refetch-slots':
          await queryClient.invalidateQueries({ queryKey: bookingKeys.slots })
          break

        // `stylist_inactive` and `service_inactive`. An admin changed the catalogue mid-flow,
        // so the lists the controls are built from are the stale thing, not the slots.
        case 'refetch-catalogue':
          await Promise.all(
            catalogueKeys.roots.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
          )
          break

        default:
          break
      }
    },
  })

  return {
    confirm: (slot, serviceId) =>
      mutation.mutate({ stylistId: slot.stylistId, serviceId, start: slot.start }),
    isPending: mutation.isPending,
    notice,
    dismiss: () => setNotice(undefined),
    keepsPick,
  }
}
