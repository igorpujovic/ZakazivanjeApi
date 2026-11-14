/**
 * The side panel's state: what is being edited, what has been typed, and what the API said.
 *
 * Shared by both catalogue screens, because none of it differs between them — a service has
 * three fields and a stylist has one, and that is the only difference, which is why the fields
 * themselves stay in the pages and everything around them is here.
 *
 * Two decisions are worth reading.
 *
 * **The draft is derived, not copied.** What the panel shows is the row the API answered with,
 * overlaid with whatever has been typed. Nothing is copied into state when the panel opens, so
 * there is no effect synchronising a form with a fetch — and if the answer arrives after
 * somebody started typing, their typing still wins.
 *
 * **The edit panel opens through a request.** `GET /api/services/{id}` is the only route in
 * the API that answers with a withdrawn service by id, and `PUT` is a full replacement: a form
 * filled from a list row fetched minutes ago would post that stale copy back over whatever has
 * happened since. Stylists have no such route and need none — `StylistResponse` is
 * `{ id, name, isActive }`, so the row already holds everything the panel edits.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

// Written for the two auth forms, and the same question here: the API's `errors` keys come in
// three shapes and only one of them looks like a field name.
import { splitFieldErrors } from '../auth/fieldErrors'
import { bookingKeys } from '../booking/bookingApi'
import { isApiError } from '../api/errors'
import { messageFor } from '../lib/errorCopy'
import { openerNow } from '../ui/openerFocus'
import { catalogueKeys } from './catalogue'
import type { CatalogueAdmin, CatalogueRow } from './catalogueAdmin'

/**
 * What the panel is for: a row being changed, or a new one.
 *
 * Wrapped in an object rather than held as `Row | undefined`, because the panel has three
 * states and not two — closed, open on a row, and open on nothing — and the outer `undefined`
 * is what tells the first apart from the third.
 */
interface Editing<Row> {
  row: Row | undefined
}

export interface CatalogueEditor<Row extends CatalogueRow, Draft> {
  open: boolean

  /** The row being edited, or `undefined` while a new one is being created. */
  editing: Row | undefined

  /** Still fetching the row to edit. The form is not rendered until it is here. */
  loading: boolean

  /** What the inputs should show: the API's answer, overlaid with what has been typed. */
  draft: Draft | undefined

  /** One field changed. Records an override; the rest keeps coming from the API's answer. */
  change: (patch: Partial<Draft>) => void

  create: () => void
  edit: (row: Row) => void
  close: () => void

  save: () => void
  saving: boolean

  /** The server's complaints, on the fields they name. */
  fieldErrors: Partial<Record<keyof Draft & string, string[]>>

  /** One line for the top of the panel: a refusal that named no field, or a failure. */
  message: string | undefined

  /** The control the panel was opened from, which focus goes back to when it closes. */
  opener: HTMLElement | undefined
}

export function useCatalogueEditor<Row extends CatalogueRow, Draft extends object>(
  admin: CatalogueAdmin<Row, Draft>,
): CatalogueEditor<Row, Draft> {
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Editing<Row> | undefined>(undefined)

  /*
   * The row's Edit button, or the one that asked for a new service — read at the click, which
   * is the only moment it is unambiguous. See `ui/openerFocus.ts`.
   */
  const [opener, setOpener] = useState<HTMLElement | undefined>(undefined)
  const [edits, setEdits] = useState<Partial<Draft>>({})
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Draft & string, string[]>>
  >({})

  const row = editing?.row

  /*
   * The row as the API has it now. Disabled for a new one, and for a kind of row the API
   * offers no way to ask about — `enabled` is how both of those are the same thing here.
   */
  const loaded = useQuery({
    queryKey: catalogueKeys.byId(admin.root, row?.id ?? 0),

    // Both assertions are what `enabled` on the next line guarantees: this never runs for a
    // new row, nor for a kind of row the API offers no way to ask about.
    queryFn: () => admin.load!(row!.id),
    enabled: admin.load !== undefined && row !== undefined,

    // Opening the panel is the moment to find out what is true, so this one answer is never
    // served from cache however fresh the list behind it happens to be — and is not kept
    // afterwards, there being nothing else that would ever read it.
    staleTime: 0,
    gcTime: 0,
  })

  const loading = admin.load !== undefined && row !== undefined && loaded.isPending

  const source = row === undefined ? undefined : (loaded.data ?? row)
  const draft =
    editing === undefined ? undefined : { ...admin.draftFrom(source), ...edits }

  const reset = () => {
    setEdits({})
    setMessage(undefined)
    setFieldErrors({})
  }

  const mutation = useMutation({
    /*
     * Updated against `source`, not against the row that was clicked.
     *
     * The difference is `isActive`, and it is the case this panel's request exists for: a
     * `PUT` is a full replacement, so the flag it carries is the one the service will have
     * afterwards. Taken from the row, correcting a typo in a service somebody withdrew while
     * this list was open would put it back on the menu — the silent reactivation
     * `UpdateServiceRequest` requires the flag in order to prevent. Taken from the answer the
     * panel opened on, it carries what is actually true.
     */
    mutationFn: (sending: Draft) =>
      source === undefined ? admin.create(sending) : admin.update(source, sending),

    onSuccess: async () => {
      setEditing(undefined)
      reset()

      await Promise.all([
        // The list, both ways it may have been fetched — and the panel's own copy of the row,
        // which hangs off the same prefix.
        queryClient.invalidateQueries({ queryKey: admin.root }),

        /*
         * And the slot grids. A duration is the only thing that decides when a booking ends,
         * so changing one changes which starts the API will offer. Marked stale rather than
         * refetched: no grid is mounted here, and `/book` re-asks when it is next opened.
         */
        queryClient.invalidateQueries({ queryKey: bookingKeys.slots, refetchType: 'none' }),
      ])
    },

    onError: (cause) => {
      if (!isApiError(cause)) {
        setMessage(messageFor(cause))
        return
      }

      /*
       * The form's fields are the draft's own keys, which are also the API's property names —
       * `catalogueDraft.ts` is where that correspondence is kept. Taking them from the draft
       * rather than listing them again is what stops a third list drifting from the other two.
       */
      const fields = Object.keys(draft ?? {}) as (keyof Draft & string)[]
      const split = splitFieldErrors(cause, fields)

      setFieldErrors(split.byField)

      /*
       * A banner only for what the fields cannot say. A `400` whose every complaint landed on
       * a field is already being told, and `invalid_request` carries no `detail` worth
       * repeating above it.
       */
      setMessage(
        split.unmatched.length > 0
          ? split.unmatched.join(' ')
          : Object.keys(split.byField).length > 0
            ? undefined
            : messageFor(cause),
      )
    },
  })

  return {
    open: editing !== undefined,
    editing: row,
    loading,
    draft,

    change: (patch) => {
      setEdits((current) => ({ ...current, ...patch }))

      /*
       * The server's complaint was about the value that was sent, so a box changed since is no
       * longer the box it describes. Only the fields being edited are cleared: a `400` can name
       * two, and correcting one of them says nothing about the other.
       */
      setFieldErrors((current) => {
        const left = { ...current }
        for (const field of Object.keys(patch)) delete left[field as keyof Draft & string]
        return left
      })
    },

    create: () => {
      reset()
      setOpener(openerNow())
      setEditing({ row: undefined })
    },

    edit: (target) => {
      reset()
      setOpener(openerNow())
      setEditing({ row: target })
    },

    close: () => {
      reset()
      setEditing(undefined)
    },

    save: () => {
      if (draft !== undefined) mutation.mutate(draft)
    },

    saving: mutation.isPending,
    fieldErrors,
    message,
    opener,
  }
}
