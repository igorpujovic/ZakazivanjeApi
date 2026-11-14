/**
 * The fan-out: one `available-slots` call per stylist being considered, in parallel.
 *
 * `useQueries` rather than a hand-rolled `Promise.all` because each stylist's answer is then a
 * cache entry in its own right, keyed by stylist, day and service. That is what makes the
 * recoveries cheap: after a lost race, invalidating `bookingKeys.slots` refetches exactly the
 * calls that are still on screen, and changing the service re-asks without the page unmounting
 * anything.
 *
 * The merge itself is pure and lives in `slots.ts`. This hook is only the wiring.
 */

import { useQueries } from '@tanstack/react-query'

import type { Stylist } from '../api/dto'
import { availableSlotsQuery } from './bookingApi'
import { isReadyToShowSlots, type Selection } from './selection'
import { mergeSlots, type Slot, type StylistAnswer } from './slots'

export interface SlotsView {
  /**
   * `idle` — not enough chosen yet to ask anything.
   * `pending` — at least one stylist has not answered.
   * `error` — every stylist asked failed, so there is nothing to show and no honest grid.
   * `ready` — at least one answer arrived; `slots` is the merge of the ones that did.
   */
  status: 'idle' | 'pending' | 'error' | 'ready'

  slots: readonly Slot[]

  /**
   * How long an appointment runs, as the API computed the offers against — echoed back on
   * every answer. Taken from the answer rather than from the chosen service on purpose: if an
   * admin changed the service's duration between the two calls, the ends shown have to be the
   * ones these starts were actually offered for.
   */
  durationMinutes: number | undefined

  /** Why nothing could be shown. Only set when `status` is `error`. */
  error: Error | undefined

  /**
   * How many stylists could not be reached, when others could.
   *
   * Kept separate from `error` because a half-answer is a half-answer: refusing to show the
   * four stylists who replied because a fifth did not would be worse, and quietly merging the
   * fifth in as "no free time" would be a lie. The page shows the grid and says so.
   */
  unreachable: number
}

export function useSlots(
  selection: Selection,
  stylists: readonly Stylist[] | undefined,
): SlotsView {
  // The service and the day, once both are known. Held as a value rather than asked twice, so
  // the type narrowing survives into the query list below.
  const dayAndService = isReadyToShowSlots(selection)
    ? { serviceId: selection.serviceId, date: selection.date }
    : undefined

  /*
   * Who gets asked. No preference means everyone the catalogue offers — this is the whole of
   * the gap the API leaves and the frontend closes. A named stylist collapses to one call, and
   * `filter` rather than a lookup means a stylist who has since been retired is asked about by
   * nobody instead of being asked about with a 404.
   */
  const asked =
    dayAndService === undefined || stylists === undefined
      ? []
      : selection.stylistId === undefined
        ? stylists
        : stylists.filter((candidate) => candidate.id === selection.stylistId)

  const results = useQueries({
    queries:
      dayAndService === undefined
        ? []
        : asked.map((candidate) =>
            availableSlotsQuery({ ...dayAndService, stylistId: candidate.id }),
          ),
  })

  const answers: StylistAnswer[] = []
  let durationMinutes: number | undefined
  let failures = 0

  results.forEach((result, index) => {
    const answered = result.data
    const who = asked[index]

    if (answered === undefined || who === undefined) {
      if (result.isError) failures += 1
      return
    }

    answers.push({ stylistId: who.id, stylistName: who.name, slots: answered.slots })
    durationMinutes ??= answered.durationMinutes
  })

  const status: SlotsView['status'] =
    results.length === 0
      ? 'idle'
      : results.some((result) => result.isPending)
        ? 'pending'
        : answers.length === 0
          ? 'error'
          : 'ready'

  return {
    status,
    // The catalogue's order decides who keeps a shared start, so `asked` is passed through as
    // the API listed it — see `mergeSlots`.
    slots: mergeSlots(answers),
    durationMinutes,
    error: status === 'error' ? (results[0]?.error ?? undefined) : undefined,
    unreachable: status === 'ready' ? failures : 0,
  }
}
