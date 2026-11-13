import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMinutes,
  asWallClock,
  asWallClockDate,
  dateOf,
  formatDate,
  formatMoney,
  formatRange,
  formatTime,
  isAfter,
  isBefore,
  isWallClock,
  minutesBetween,
} from './wallClock'

/**
 * These tests run under `TZ=Asia/Kolkata` (set in `vite.config.ts`) — a half-hour offset from
 * UTC, and nowhere near the salon. That is the whole point: a wall-clock test that passes only
 * because the machine agrees with the server proves nothing. If `parse` is ever switched to
 * `new Date(string)`, or a conversion sneaks in, the offset shows up here as a failure.
 */
describe('the timezone trap', () => {
  it('is not running in the salon-adjacent timezone the bugs would hide in', () => {
    // Asserted as behaviour, not by name: Node reports Asia/Kolkata under its legacy alias
    // Asia/Calcutta. What matters is that the harness is offset from UTC by a half hour, so
    // any leaked conversion shows up in both the hours and the minutes.
    const offsetMinutes = -new Date(Date.UTC(2026, 10, 20, 0, 0, 0)).getTimezoneOffset()
    expect(offsetMinutes).toBe(330)

    // Sanity, and worth being precise about where the naive parse actually goes wrong.
    // `new Date("2026-11-20T09:30:00")` parses as *local* time, so reading it back locally
    // round-trips and looks fine — `getHours()` really is 9 here. The damage is in the UTC
    // projection, which is what serialising the value uses: in this zone the same instant is
    // 04:00 UTC, so posting it back would move the appointment five and a half hours.
    const naive = new Date('2026-11-20T09:30:00')
    expect(naive.getHours()).toBe(9)
    expect(naive.getUTCHours()).toBe(4)
    expect(naive.getUTCMinutes()).toBe(0)
  })

  it('renders the salon wall clock, not the visitor local clock', () => {
    // 09:30 at the salon must read as 09:30 in Kolkata, in London, anywhere. The naive
    // `new Date(string)` above shows what happens otherwise.
    expect(formatTime(asWallClock('2026-11-20T09:30:00'))).toBe('09:30')
    expect(formatTime(asWallClock('2026-11-20T00:00:00'))).toBe('00:00')
    expect(formatTime(asWallClock('2026-11-20T23:45:00'))).toBe('23:45')
  })

  it('round-trips a value through arithmetic unchanged', () => {
    const start = asWallClock('2026-11-20T09:30:00')
    expect(addMinutes(addMinutes(start, 90), -90)).toBe(start)
  })
})

describe('entering the type', () => {
  it('accepts what the API sends', () => {
    expect(isWallClock('2026-11-20T09:30:00')).toBe(true)
    expect(isWallClock('2026-11-20T09:30')).toBe(true)
    expect(isWallClock('2026-11-20T09:30:00.123')).toBe(true)
  })

  it('rejects anything carrying a zone, because the API never sends one', () => {
    expect(isWallClock('2026-11-20T09:30:00Z')).toBe(false)
    expect(isWallClock('2026-11-20T09:30:00+01:00')).toBe(false)
  })

  it('rejects what is not a time at all', () => {
    expect(isWallClock('2026-11-20')).toBe(false)
    expect(isWallClock('')).toBe(false)
    expect(isWallClock('tomorrow')).toBe(false)
  })

  it('throws rather than producing an invalid value', () => {
    expect(() => asWallClock('2026-11-20T09:30:00Z')).toThrow(TypeError)
    expect(() => asWallClockDate('2026-11-20T09:30:00')).toThrow(TypeError)
  })
})

describe('arithmetic', () => {
  it('adds minutes across an hour', () => {
    expect(addMinutes(asWallClock('2026-11-20T09:30:00'), 90)).toBe('2026-11-20T11:00:00')
  })

  it('adds minutes across midnight', () => {
    expect(addMinutes(asWallClock('2026-11-20T23:45:00'), 30)).toBe('2026-11-21T00:15:00')
  })

  it('adds minutes across a month boundary', () => {
    expect(addMinutes(asWallClock('2026-11-30T23:30:00'), 60)).toBe('2026-12-01T00:30:00')
  })

  it('adds days across a leap day', () => {
    expect(addDays(asWallClockDate('2028-02-28'), 1)).toBe('2028-02-29')
    expect(addDays(asWallClockDate('2026-02-28'), 1)).toBe('2026-03-01')
  })

  it('steps backwards', () => {
    expect(addDays(asWallClockDate('2026-01-01'), -1)).toBe('2025-12-31')
  })

  it('measures a gap in minutes', () => {
    expect(
      minutesBetween(asWallClock('2026-11-20T09:30:00'), asWallClock('2026-11-20T11:00:00')),
    ).toBe(90)
  })

  /**
   * Northern-hemisphere DST weekend. In a browser whose own timezone springs forward, local
   * `Date` arithmetic would skip or repeat an hour here and the salon's clock would move with
   * it. The carrier is UTC, so it does not.
   */
  it('is unmoved by a daylight-saving transition', () => {
    expect(addMinutes(asWallClock('2027-03-28T01:30:00'), 60)).toBe('2027-03-28T02:30:00')
    expect(addMinutes(asWallClock('2027-10-31T01:30:00'), 60)).toBe('2027-10-31T02:30:00')
  })
})

describe('comparison', () => {
  it('orders by time without touching a Date', () => {
    const earlier = asWallClock('2026-11-20T09:30:00')
    const later = asWallClock('2026-11-20T11:00:00')
    expect(isBefore(earlier, later)).toBe(true)
    expect(isAfter(later, earlier)).toBe(true)
    expect(isBefore(earlier, earlier)).toBe(false)
  })

  it('orders across days and years', () => {
    expect(isBefore(asWallClock('2026-12-31T23:59:00'), asWallClock('2027-01-01T00:00:00'))).toBe(
      true,
    )
  })
})

describe('formatting', () => {
  it('takes the date half as a string, with nothing to shift', () => {
    expect(dateOf(asWallClock('2026-11-20T09:30:00'))).toBe('2026-11-20')
  })

  it('formats a slot as a range', () => {
    const start = asWallClock('2026-11-20T09:30:00')
    expect(formatRange(start, addMinutes(start, 90))).toBe('09:30–11:00')
  })

  it('formats a date day-first, for the salon market', () => {
    const formatted = formatDate(asWallClock('2026-11-20T09:30:00'))
    expect(formatted).toContain('20')
    expect(formatted).toContain('2026')
  })

  it('formats money as RSD', () => {
    expect(formatMoney(2500)).toMatch(/2\.?500/)
    expect(formatMoney(2500)).toMatch(/RSD|din/i)
  })
})
