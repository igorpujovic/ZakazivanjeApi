/**
 * "No preference", which the API cannot express, closed on the client.
 *
 * `GET /api/stylists/{id}/available-slots` answers for **one** stylist on one day, and the
 * stylist control's default is No preference. The spec calls this the one place the frontend
 * compensates for the API's shape rather than asking the API to change: one call per active
 * stylist, in parallel, merged here into a single grid.
 *
 * Doing it in a pure function is the point. The interesting part of the booking page is this
 * merge and the race recovery; everything a test would otherwise have to drive a browser to
 * discover about ordering, labelling and ties is settled by `slots.test.ts` against data.
 */

import { isAfter, isBefore, type WallClock } from '../lib/wallClock'

/** One start on offer, and the stylist who would do it. */
export interface Slot {
  start: WallClock
  stylistId: number
  stylistName: string
}

/** What one stylist answered for the day. The shape of `AvailableSlotsResponse`, named. */
export interface StylistAnswer {
  stylistId: number
  stylistName: string
  slots: readonly WallClock[]
}

/**
 * Chronological order, from string order alone.
 *
 * These values are fixed-width and big-endian, so lexicographic order *is* chronological
 * order — see rule 3 in `wallClock.ts`. Going through `isBefore` / `isAfter` rather than
 * comparing the strings here keeps that reasoning in the one module that owns it.
 */
const byStart = (a: Slot, b: Slot): number =>
  isBefore(a.start, b.start) ? -1 : isAfter(a.start, b.start) ? 1 : 0

/**
 * Every start any of these stylists is free for, once each, ascending.
 *
 * Two decisions are worth stating, because both are visible to whoever uses the grid:
 *
 * **A start appears once, not once per stylist who is free then.** A visitor who said No
 * preference asked not to choose a stylist, so showing them 09:00 three times would be asking
 * exactly that, in the most confusing way available — three identical-looking buttons.
 *
 * **A shared start goes to whichever stylist the caller listed first**, which is the order
 * `GET /api/stylists` returned. Not a fairness rule, and deliberately not one: spreading work
 * across stylists is salon policy, the API has no notion of it, and inventing one here would
 * be the frontend quietly making a decision the salon never delegated. What this rule does
 * guarantee is *stability* — the same catalogue and the same day produce the same grid, so a
 * refetch after a lost race does not reshuffle the names under the visitor's finger.
 *
 * Only answers that arrived belong here. A stylist whose request failed is not an absence of
 * free time and must not be merged in as one; `useSlots` keeps those separate and says so.
 */
export function mergeSlots(answers: readonly StylistAnswer[]): Slot[] {
  const byTime = new Map<string, Slot>()

  for (const { stylistId, stylistName, slots } of answers) {
    for (const start of slots) {
      // First writer wins, so the earliest-listed stylist keeps a shared start.
      if (!byTime.has(start)) byTime.set(start, { start, stylistId, stylistName })
    }
  }

  return [...byTime.values()].sort(byStart)
}
