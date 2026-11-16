import { describe, expect, it } from 'vitest'

import { openLabel, openStateAt, week, weekRuns } from './house'
import { asWallClock } from '../lib/wallClock'

/**
 * The sign in the window.
 *
 * Worth a test rather than worth trusting, for the reason every other date question in this
 * application is: the answers are wrong at the boundary or wrong by a day, and both are
 * invisible until somebody is told the shop is open when it is shut. The suite runs under a
 * forced non-Belgrade `TZ` (see `vite.config.ts`), so a weekday that came out of a visitor's
 * timezone rather than out of the date would show up here.
 *
 * November 2026: the 16th is a Monday, the 21st a Saturday, the 22nd a Sunday.
 */

describe('whether the shop is open', () => {
  it('is open during the week, and says when it shuts', () => {
    expect(openStateAt(asWallClock('2026-11-16T10:30:00'))).toEqual({
      open: true,
      until: '17:00',
    })
  })

  it('is shut at the closing minute, not a minute after it', () => {
    expect(openStateAt(asWallClock('2026-11-16T16:59:00')).open).toBe(true)
    expect(openStateAt(asWallClock('2026-11-16T17:00:00')).open).toBe(false)
  })

  it('shuts at two on a Saturday, which is the one day with its own hours', () => {
    expect(openStateAt(asWallClock('2026-11-21T13:00:00'))).toEqual({
      open: true,
      until: '14:00',
    })
    expect(openStateAt(asWallClock('2026-11-21T15:00:00')).open).toBe(false)
  })

  it('points at today when the day has not started yet', () => {
    expect(openStateAt(asWallClock('2026-11-16T07:00:00'))).toEqual({
      open: false,
      next: { daysAhead: 0, weekday: 'Monday', at: '09:00' },
    })
  })

  it('points at tomorrow once the day is over', () => {
    expect(openStateAt(asWallClock('2026-11-16T19:00:00'))).toEqual({
      open: false,
      next: { daysAhead: 1, weekday: 'Tuesday', at: '09:00' },
    })
  })

  it('skips the day the shop is shut: Saturday evening looks past Sunday to Monday', () => {
    expect(openStateAt(asWallClock('2026-11-21T18:00:00'))).toEqual({
      open: false,
      next: { daysAhead: 2, weekday: 'Monday', at: '09:00' },
    })
  })

  it('is shut all day Sunday, whatever the hour', () => {
    expect(openStateAt(asWallClock('2026-11-22T11:00:00'))).toEqual({
      open: false,
      next: { daysAhead: 1, weekday: 'Monday', at: '09:00' },
    })
  })
})

describe('the sign, in words', () => {
  it('names the closing time while the shop is open', () => {
    expect(openLabel(openStateAt(asWallClock('2026-11-16T10:30:00')))).toBe('Open until 17:00')
  })

  it('says today, tomorrow or the weekday — whichever is the truth', () => {
    expect(openLabel(openStateAt(asWallClock('2026-11-16T07:00:00')))).toBe(
      'Closed · opens today at 09:00',
    )
    expect(openLabel(openStateAt(asWallClock('2026-11-16T19:00:00')))).toBe(
      'Closed · opens tomorrow at 09:00',
    )
    expect(openLabel(openStateAt(asWallClock('2026-11-21T18:00:00')))).toBe(
      'Closed · opens Monday at 09:00',
    )
  })
})

describe('the week, as the shop card prints it', () => {
  it('runs Monday to Sunday, every day accounted for', () => {
    expect(week.map((day) => day.weekday)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })

  it('lists the shut day rather than leaving it out', () => {
    expect(week.at(-1)).toEqual({ weekday: 'Sunday', hours: undefined })
  })

  /*
   * The mirror this module warns about, asserted in one place. If `appsettings.json` changes
   * and this file does not, the hours printed on the page would quietly stop matching the
   * grid the API answers with — so the pair of numbers that would drift is written down here.
   */
  it('matches the hours the API is configured with', () => {
    expect(week[0].hours).toEqual({ open: '09:00', close: '17:00' })
    expect(week[5].hours).toEqual({ open: '09:00', close: '14:00' })
  })
})

describe('the week, collapsed the way a sign writes it', () => {
  it('runs the identical days together and leaves the odd ones out alone', () => {
    expect(weekRuns).toEqual([
      { from: 'Monday', to: 'Friday', hours: { open: '09:00', close: '17:00' } },
      { from: 'Saturday', to: 'Saturday', hours: { open: '09:00', close: '14:00' } },
      { from: 'Sunday', to: 'Sunday', hours: undefined },
    ])
  })
})
