/**
 * The shop: who it is, where it is, and when it is open.
 *
 * Every detail a visitor would look for on a barbershop's page and the API has no opinion
 * about — the name over the door, the street, the phone, the opening hours. One module, so
 * the shop can be renamed or moved by editing this file and nothing else; the screens read
 * from here rather than carrying an address in markup.
 *
 * The hours are the delicate part. They are **mirrored** from `WorkingHours:Days` in
 * `ZakazivanjeApi/appsettings.json` — the same arrangement `lib/limits.ts` has with
 * `CatalogueLimits.cs`, and for the same reason: the API does not publish them. There is no
 * endpoint that says when the shop is open, only `available-slots`, which answers a day at a
 * time by returning nothing for a day the shop is shut (ADR-0002). So a page that wants to
 * print "Saturday 09:00–14:00" has to hold its own copy, and the thing to know about that
 * copy is that it is decoration: it decides what is *said*, never what is *offered*. The grid
 * comes from the API, and if these two ever disagree the API is right.
 *
 * Open-or-shut is computed from the browser's approximate wall clock, which is honest for a
 * sign in the window and nothing more — see `nowWallClock`.
 */

import { timeOfDay, weekdayIndexOf, type WallClock } from '../lib/wallClock'

/** The shop's own details. English copy for a Belgrade market, as everywhere else. */
export const shop = {
  name: 'Kalemegdan Barbers',

  /** What it is, in two words, for the line above the name. */
  kind: 'Barbershop',

  establishedYear: 2011,

  street: 'Cara Dušana 42',
  neighbourhood: 'Dorćol',
  city: 'Belgrade',

  /** As it is read aloud, and as a `tel:` link wants it — the same number, written twice. */
  phone: '011 2345 678',
  phoneHref: 'tel:+381112345678',

  tagline:
    'Cuts, shaves and beard work, by appointment. Four chairs, no rush, and a hot towel if you want one.',
} as const

/** One line, for the footer and the shop card: `Cara Dušana 42, Dorćol, Belgrade`. */
export const address = `${shop.street}, ${shop.neighbourhood}, ${shop.city}`

// -- Opening hours ----------------------------------------------------------------------

/** `HH:mm`, the way the API's configuration writes a time of day. */
export interface OpeningHours {
  readonly open: string
  readonly close: string
}

export type Weekday =
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'

/** Indexed as {@link weekdayIndexOf} answers: `0` is Sunday, as `Date.getUTCDay` has it. */
const WEEKDAYS: readonly Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/**
 * The week, mirrored from `appsettings.json`. `undefined` is a day the shop is shut, which is
 * `null` in the configuration and an empty answer from `available-slots`.
 */
const HOURS: readonly (OpeningHours | undefined)[] = [
  undefined, // Sunday
  { open: '09:00', close: '17:00' },
  { open: '09:00', close: '17:00' },
  { open: '09:00', close: '17:00' },
  { open: '09:00', close: '17:00' },
  { open: '09:00', close: '17:00' },
  { open: '09:00', close: '14:00' }, // Saturday
]

/**
 * The week as a person reads a sign in a window: Monday first, Sunday last, every day listed
 * — including the shut one, because "Sunday: closed" is the answer somebody came looking for.
 */
export const week: readonly { readonly weekday: Weekday; readonly hours?: OpeningHours }[] = [
  1, 2, 3, 4, 5, 6, 0,
].map((index) => ({ weekday: WEEKDAYS[index], hours: HOURS[index] }))

/**
 * Which day of the week it is, by the shop's names for the days — so a list of hours can put
 * a mark against the line the visitor is actually standing in.
 */
export function weekdayAt(now: WallClock): Weekday {
  return WEEKDAYS[weekdayIndexOf(now)]
}

/** A run of days with the same hours. `hours` absent means the shop is shut on all of them. */
export interface HoursRun {
  readonly from: Weekday
  readonly to: Weekday
  readonly hours?: OpeningHours
}

/**
 * The week collapsed the way a sign writes it: `Monday–Friday`, then `Saturday`, then
 * `Sunday`. Five identical lines are five chances to misread the one that differs, which on
 * this shop's hours is Saturday.
 *
 * Computed from {@link week} rather than written out, so a change to the hours cannot leave a
 * summary behind saying something else.
 */
export const weekRuns: readonly HoursRun[] = week.reduce<HoursRun[]>((runs, day) => {
  const last = runs.at(-1)

  if (
    last !== undefined &&
    last.hours?.open === day.hours?.open &&
    last.hours?.close === day.hours?.close
  ) {
    runs[runs.length - 1] = { ...last, to: day.weekday }
    return runs
  }

  runs.push({ from: day.weekday, to: day.weekday, hours: day.hours })
  return runs
}, [])

/** The next day the shop opens, and how far off it is. `0` days ahead means later today. */
export interface NextOpening {
  readonly daysAhead: number
  readonly weekday: Weekday
  readonly at: string
}

/**
 * Open, or shut and when it opens next. A union rather than a bag of optional fields, so a
 * screen cannot print a closing time for a shop that is closed.
 *
 * `next` is `undefined` only for a shop configured to open on no day at all. That cannot
 * happen with the hours above, and is the kind of thing a type should still account for
 * rather than crash on.
 */
export type OpenState =
  | { readonly open: true; readonly until: string }
  | { readonly open: false; readonly next: NextOpening | undefined }

/**
 * Whether the shop is open at a given moment.
 *
 * The comparisons are string comparisons on `HH:mm`, which is why nothing here converts
 * anything: fixed-width and big-endian means lexicographic order *is* chronological order,
 * the same property `wallClock`'s own comparisons rest on.
 *
 * Open is `open <= now < close`: at the closing minute the shop is shut, which matches the
 * API refusing a booking that would end after close.
 */
export function openStateAt(now: WallClock): OpenState {
  const index = weekdayIndexOf(now)
  const today = HOURS[index]
  const time = timeOfDay(now)

  if (today !== undefined && time >= today.open && time < today.close) {
    return { open: true, until: today.close }
  }

  // Still to come today — a visitor looking at the page over breakfast.
  if (today !== undefined && time < today.open) {
    return { open: false, next: { daysAhead: 0, weekday: WEEKDAYS[index], at: today.open } }
  }

  // Otherwise the next day with hours at all, which is how Sunday finds Monday.
  for (let daysAhead = 1; daysAhead <= 7; daysAhead += 1) {
    const nextIndex = (index + daysAhead) % 7
    const hours = HOURS[nextIndex]
    if (hours !== undefined) {
      return { open: false, next: { daysAhead, weekday: WEEKDAYS[nextIndex], at: hours.open } }
    }
  }

  return { open: false, next: undefined }
}

/**
 * The sign in the window, in words.
 *
 * Here rather than in the component because the phrasing is the interesting part — "opens
 * tomorrow" is a different sentence from "opens Monday" and both are wrong by a day if the
 * arithmetic slips — and a pure function can be asked about Saturday at five o'clock directly.
 */
export function openLabel(state: OpenState): string {
  if (state.open) return `Open until ${state.until}`
  if (state.next === undefined) return 'Closed'

  const { daysAhead, weekday, at } = state.next
  const when = daysAhead === 0 ? 'today' : daysAhead === 1 ? 'tomorrow' : weekday
  return `Closed · opens ${when} at ${at}`
}

// -- House notes ------------------------------------------------------------------------

/**
 * What the shop would tell you at the door. Three, and each one true of this application:
 * the cancellation window is the client half of the **Cancellation Deadline**
 * (`booking/myBookings.ts`), and a slot really is an offer rather than a hold until it is
 * confirmed (`ui/SlotGrid.tsx`).
 */
export const houseNotes: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Walk in if you like',
    body: 'We will take you if a chair is free. Booking is how you are sure of one.',
  },
  {
    title: 'Change of plan',
    body: 'Call your appointment off from your bookings, up to two hours before it starts.',
  },
  {
    title: 'Five minutes early',
    body: 'Long enough for a coffee. The chair is yours from the time you picked, not before.',
  },
]
