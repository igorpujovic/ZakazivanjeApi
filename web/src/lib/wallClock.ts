/**
 * Wall-clock time, as the API means it.
 *
 * ADR-0001 keeps every API time local salon wall-clock, never UTC, and `DateTime` with
 * `Kind.Unspecified` serialises with no `Z` and no offset: `"2026-11-20T09:30:00"`.
 *
 * JavaScript is the worst possible consumer of that string. Two traps:
 *
 *   `new Date("2026-11-20T09:30:00")` parses as *browser-local* time, which renders
 *   correctly in Belgrade and silently wrong anywhere else.
 *
 *   `.toISOString()` converts to UTC, so a value round-tripped through a `Date` posts back
 *   an hour off — reintroducing on the client exactly the bug ADR-0001 exists to prevent on
 *   the server.
 *
 * So this module never parses a date string and never converts one. The rules it keeps:
 *
 *   1. A wall-clock value is a *string* of components, not a moment in time. Nothing in the
 *      application may hold one as a `Date`.
 *   2. Where a `Date` is unavoidable — arithmetic, `Intl` — it is built with `Date.UTC` from
 *      explicit components and read back with `getUTC*`. UTC is used as a *neutral carrier*,
 *      not as a timezone: the components go in and the same components come out, whatever the
 *      browser's zone. Every `Intl` call therefore passes `timeZone: 'UTC'`.
 *   3. Comparison needs no `Date` at all. These strings are fixed-width and big-endian, so
 *      lexicographic order *is* chronological order.
 *
 * `toISOString` and `toJSON` are banned in `src/` by a test — `noConversions.test.ts`, since
 * oxlint has no `no-restricted-syntax` — and the tests run under a forced `TZ` of Asia/Kolkata,
 * a half-hour offset, so naive arithmetic fails loudly.
 *
 * See ADR-0011.
 */

declare const brand: unique symbol

/** `"2026-11-20T09:30:00"` — a date and time with no zone. The API's `DateTime`. */
export type WallClock = string & { readonly [brand]: 'WallClock' }

/** `"2026-11-20"` — a date with no zone or time. The API's `DateOnly`. */
export type WallClockDate = string & { readonly [brand]: 'WallClockDate' }

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
const WALL_CLOCK_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// -- Entering the type ------------------------------------------------------------------

export function isWallClock(value: string): value is WallClock {
  return WALL_CLOCK.test(value)
}

export function isWallClockDate(value: string): value is WallClockDate {
  return WALL_CLOCK_DATE.test(value)
}

/**
 * The only way a raw string becomes a {@link WallClock}. Throws rather than returning
 * something wrong: a malformed time is a bug in us or a contract break by the API, and
 * either way rendering "Invalid Date" to a client is worse than failing where it happened.
 */
export function asWallClock(value: string): WallClock {
  if (!isWallClock(value)) {
    throw new TypeError(`Not a wall-clock date and time: ${JSON.stringify(value)}`)
  }
  return value
}

export function asWallClockDate(value: string): WallClockDate {
  if (!isWallClockDate(value)) {
    throw new TypeError(`Not a wall-clock date: ${JSON.stringify(value)}`)
  }
  return value
}

// -- Components -------------------------------------------------------------------------

function partsOf(value: WallClock): Parts {
  const m = WALL_CLOCK.exec(value)!
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] === undefined ? 0 : Number(m[6]),
  }
}

function dateParts(value: WallClockDate): Parts {
  const m = WALL_CLOCK_DATE.exec(value)!
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: 0,
    minute: 0,
    second: 0,
  }
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

function fromParts(p: Parts): WallClock {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` as WallClock
}

function dateFromParts(p: Parts): WallClockDate {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}` as WallClockDate
}

/**
 * A `Date` carrying these components in UTC. Internal: a `Date` must not escape this module,
 * because the moment it does, somebody will call `toISOString()` on it.
 */
function carrier(p: Parts): Date {
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
}

function partsFromCarrier(d: Date): Parts {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

// -- Arithmetic -------------------------------------------------------------------------

export function addMinutes(value: WallClock, minutes: number): WallClock {
  const d = carrier(partsOf(value))
  d.setUTCMinutes(d.getUTCMinutes() + minutes)
  return fromParts(partsFromCarrier(d))
}

export function addDays(value: WallClockDate, days: number): WallClockDate {
  const d = carrier(dateParts(value))
  d.setUTCDate(d.getUTCDate() + days)
  return dateFromParts(partsFromCarrier(d))
}

/** The date half of a wall-clock time. Pure string work — no arithmetic, nothing to shift. */
export function dateOf(value: WallClock): WallClockDate {
  return value.slice(0, 10) as WallClockDate
}

export function atStartOfDay(value: WallClockDate): WallClock {
  return `${value}T00:00:00` as WallClock
}

// -- Comparison -------------------------------------------------------------------------
//
// Fixed-width and big-endian, so string order is chronological order. No `Date` involved,
// which means no zone can be applied and nothing can shift.

export function isBefore(a: WallClock, b: WallClock): boolean {
  return a < b
}

export function isAfter(a: WallClock, b: WallClock): boolean {
  return a > b
}

export function minutesBetween(from: WallClock, to: WallClock): number {
  return (carrier(partsOf(to)).getTime() - carrier(partsOf(from)).getTime()) / 60_000
}

// -- "Now" ------------------------------------------------------------------------------

/**
 * The browser's current local time, as a wall-clock value.
 *
 * This is the one place the visitor's timezone legitimately enters, and it is an
 * approximation: the salon's wall clock is the salon's, and nothing in the API tells us which
 * zone that is — working hours are bare `"09:00"` strings and times carry no offset. A client
 * booking from another country therefore sees *their* "today" and *their* idea of which slots
 * have passed.
 *
 * That is acceptable because the API is the authority, not us. A stale start is refused with
 * `start_in_past`, which the booking page already recovers from by refetching. We use this to
 * set sensible defaults — the `min` on a date input, which day to show first — never to decide
 * whether something is allowed.
 */
export function nowWallClock(): WallClock {
  const now = new Date()
  return fromParts({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  })
}

export function todayWallClockDate(): WallClockDate {
  return dateOf(nowWallClock())
}

// -- Formatting -------------------------------------------------------------------------
//
// `sr-RS`: the salon's market, so dates read day-first and money reads as RSD, while the copy
// around them stays English (see spec, "Vocabulary"). Every formatter is pinned to UTC so it
// renders the carrier's components and never the visitor's zone.

const LOCALE = 'sr-RS'

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  timeZone: 'UTC',
})

const moneyFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'RSD',
  maximumFractionDigits: 0,
})

export function formatTime(value: WallClock): string {
  return timeFormat.format(carrier(partsOf(value)))
}

export function formatDate(value: WallClock | WallClockDate): string {
  const parts = isWallClockDate(value) ? dateParts(value) : partsOf(value as WallClock)
  return dateFormat.format(carrier(parts))
}

export function formatWeekday(value: WallClock | WallClockDate): string {
  const parts = isWallClockDate(value) ? dateParts(value) : partsOf(value as WallClock)
  return weekdayFormat.format(carrier(parts))
}

export function formatDateTime(value: WallClock): string {
  return `${formatDate(value)}, ${formatTime(value)}`
}

/** `09:30–11:00`, for a slot or a booking. An en dash, not a hyphen. */
export function formatRange(start: WallClock, end: WallClock): string {
  return `${formatTime(start)}–${formatTime(end)}`
}

export function formatMoney(amount: number): string {
  return moneyFormat.format(amount)
}

/** Minutes as a client reads them: `90` becomes `1 h 30 min`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
