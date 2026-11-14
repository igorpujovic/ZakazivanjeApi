/**
 * The booking page's state, which lives in the address bar.
 *
 * `/book?serviceId=3&stylistId=1&date=2026-11-20`. Keeping the three choices in the URL rather
 * than in `useState` is what makes a half-made choice linkable and the back button work
 * without the page implementing history itself.
 *
 * The cost is that the page's state arrives from outside it — typed, pasted, bookmarked or
 * months stale — so it is read here sceptically rather than trusted. Anything unusable is read
 * as *not chosen*, which lands the visitor on the same page they would see having chosen
 * nothing, instead of on an error about a query string they did not write.
 */

import { isWallClockDate, type WallClockDate } from '../lib/wallClock'

/** The three choices. `stylistId: undefined` **is** No preference — see `slots.ts`. */
export interface Selection {
  serviceId: number | undefined
  stylistId: number | undefined
  date: WallClockDate | undefined
}

/**
 * A positive whole number, or nothing — an id as the query string or a control hands it over.
 *
 * `Number('')` is `0` and `Number(' ')` is `0`, so a bare `Number` would turn an empty
 * parameter into an id and ask the API about service zero. Every id the API issues is a
 * positive `int`, so anything else is not an id this application can have been given.
 */
export function asChosenId(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * A day, from anywhere it can arrive: the query string, or a native date input whose value is
 * empty while it is being filled in. Both mean the same thing when unusable — no day chosen.
 *
 * Checked for shape, not for existing: `2026-02-31` has the shape and is refused by the API's
 * `DateOnly` binding as the `400` it is. That is the right place for it — only a hand-edited
 * URL can produce one, the browser's calendar cannot, and a second calendar implementation
 * here to catch it would be a second thing to keep correct.
 */
export function asChosenDate(value: string | null): WallClockDate | undefined {
  return value !== null && isWallClockDate(value) ? value : undefined
}

/** The selection a query string describes. */
export function selectionFrom(search: string): Selection {
  const params = new URLSearchParams(search)

  return {
    serviceId: asChosenId(params.get('serviceId')),
    stylistId: asChosenId(params.get('stylistId')),
    date: asChosenDate(params.get('date')),
  }
}

/**
 * The query string for a selection, without its leading `?`.
 *
 * Written in the order the spec writes it so the address reads the way the page is filled in,
 * and a choice not yet made is simply absent — including No preference, which is the default
 * and would only be noise in a link someone is about to send to a friend.
 */
export function searchFor(selection: Selection): string {
  const params = new URLSearchParams()

  if (selection.serviceId !== undefined) params.set('serviceId', String(selection.serviceId))
  if (selection.stylistId !== undefined) params.set('stylistId', String(selection.stylistId))
  if (selection.date !== undefined) params.set('date', selection.date)

  return params.toString()
}

/**
 * Whether there is enough to ask about availability.
 *
 * `GET /api/stylists/{id}/available-slots` requires a date *and* a service — the service
 * because its duration is what decides which starts a whole appointment fits into. The stylist
 * is not among them: No preference is answered by asking all of them, so the one choice the
 * visitor is allowed to skip is the one the URL may leave out.
 */
export function isReadyToShowSlots(
  selection: Selection,
): selection is Selection & { serviceId: number; date: WallClockDate } {
  return selection.serviceId !== undefined && selection.date !== undefined
}
