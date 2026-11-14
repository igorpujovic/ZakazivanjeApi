/**
 * The inline toggle on every catalogue row, and the one question it asks.
 *
 * Activation is one boolean, which is why it is a toggle in the table rather than a field
 * buried in a form: burying it would help nobody, and an admin curating a catalogue is mostly
 * curating this. Everything interesting about it is in the asymmetry between the two
 * directions.
 *
 * **Off asks.** Withdrawing something changes what every client is offered, so it is worth a
 * sentence — and the sentence is the glossary's (`withdrawal.ts`), which says what stays as
 * well as what goes.
 *
 * **On does not.** Putting something back is harmless, and a dialog in front of a harmless
 * action is how an admin learns to dismiss dialogs without reading them.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { bookingKeys } from '../booking/bookingApi'
import { messageFor } from '../lib/errorCopy'
import { openerNow } from '../ui/openerFocus'
import type { CatalogueAdmin, CatalogueRow } from './catalogueAdmin'

export interface Activation<Row extends CatalogueRow> {
  /**
   * The row the question is about, or nothing.
   *
   * The row itself rather than its id, because the request about to go out is built from it:
   * reactivating a service `PUT`s every field back, so the thing being asked about and the
   * thing being sent have to be the same copy.
   */
  asking: Row | undefined

  /** The switch moved. Off asks first; on goes straight out. */
  toggle: (row: Row, isActive: boolean) => void

  dismiss: () => void
  confirm: () => void

  /** Which row is in flight, so one toggle can say so without disabling every other row. */
  pendingId: number | undefined

  /** Why it was refused. Shown in the dialog when there is one, and on the page when not. */
  error: string | undefined

  /** The toggle the question was asked from, which focus goes back to when it is answered. */
  opener: HTMLElement | undefined
}

export function useActivation<Row extends CatalogueRow, Draft>(
  admin: CatalogueAdmin<Row, Draft>,
): Activation<Row> {
  const queryClient = useQueryClient()

  const [asking, setAsking] = useState<Row | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  /** The switch that was just moved — read at the click. See `ui/openerFocus.ts`. */
  const [opener, setOpener] = useState<HTMLElement | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: ({ row, isActive }: { row: Row; isActive: boolean }) =>
      admin.setActive(row, isActive),

    onSuccess: async () => {
      setError(undefined)
      setAsking(undefined)

      await Promise.all([
        /*
         * The list, both ways it may have been fetched. This is the invalidation that makes a
         * service withdrawn here disappear from the menu on `/`: the admin's wider view and a
         * client's menu are two entries under one prefix, and only one of them is on screen.
         */
        queryClient.invalidateQueries({ queryKey: admin.root }),

        /*
         * And the slot grids, which have just been answered differently — a withdrawn stylist
         * offers no times, and a withdrawn service cannot be booked at all. Marked stale
         * rather than refetched: no grid is mounted on this screen, so there is nothing to
         * refetch yet and `/book` re-asks when it is next opened.
         */
        queryClient.invalidateQueries({ queryKey: bookingKeys.slots, refetchType: 'none' }),
      ])
    },

    onError: (cause) => setError(messageFor(cause)),
  })

  return {
    asking,

    toggle: (row, isActive) => {
      setError(undefined)

      // Off is the only direction worth a question. See this module's header.
      if (isActive) {
        mutation.mutate({ row, isActive: true })
        return
      }

      setOpener(openerNow())
      setAsking(row)
    },

    /*
     * No guard on a request being in flight: `ConfirmDialog` disables both its buttons and
     * refuses `Escape` and an outside press while one is, so the rule lives in one place
     * rather than being half-kept in two.
     */
    dismiss: () => {
      setError(undefined)
      setAsking(undefined)
    },

    confirm: () => {
      if (asking !== undefined) mutation.mutate({ row: asking, isActive: false })
    },

    pendingId: mutation.isPending ? mutation.variables.row.id : undefined,
    error,
    opener,
  }
}
