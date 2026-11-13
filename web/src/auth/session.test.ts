import { beforeEach, describe, expect, it } from 'vitest'

import {
  MAX_TIMER_MS,
  readStoredSession,
  SESSION_STORAGE_KEY,
  sessionStatus,
  storeSession,
} from './session'

const user = { id: 7, name: 'Mina', email: 'mina@example.test', role: 'Client' }

const session = (expiresAt: string) => ({
  accessToken: 'a-token',
  expiresAt,
  user,
})

beforeEach(() => {
  sessionStorage.clear()
})

describe('a stored session that has already expired', () => {
  it('is not returned', () => {
    storeSession(session('2026-11-13T09:00:00+01:00'))

    const now = Date.parse('2026-11-13T09:00:01+01:00')

    expect(readStoredSession(now)).toBeUndefined()
  })

  it('is removed from storage, so it is not reconsidered', () => {
    storeSession(session('2026-11-13T09:00:00+01:00'))

    readStoredSession(Date.parse('2026-11-13T09:00:01+01:00'))

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })
})

describe('a stored session that is still live', () => {
  it('comes back, so a reload keeps you signed in', () => {
    storeSession(session('2026-11-13T10:00:00+01:00'))

    const now = Date.parse('2026-11-13T09:30:00+01:00')

    expect(readStoredSession(now)).toEqual(session('2026-11-13T10:00:00+01:00'))
  })
})

describe('a stored value that is not a session at all', () => {
  /**
   * Nothing but this application writes the key, so arriving here means a half-written value
   * or a shape from an older build. Either way it is not worth a white screen at startup:
   * there is a login page one redirect away.
   */
  it('is discarded rather than thrown out of startup', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, '{ not json')

    expect(readStoredSession(Date.now())).toBeUndefined()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('is discarded when it parses but has no token', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ user, expiresAt: '2099-01-01T00:00:00Z' }))

    expect(readStoredSession(Date.now())).toBeUndefined()
  })

  it('is discarded when expiresAt is not a date', () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...session('whenever'), expiresAt: 'whenever' }),
    )

    expect(readStoredSession(Date.now())).toBeUndefined()
  })
})

// The rule these exercise, and why it is derived from the clock rather than scheduled, is
// documented on `sessionStatus` in ./session.ts.
describe('a session with plenty of time left', () => {
  const live = session('2026-11-13T10:00:00+01:00')
  const at = (time: string) => Date.parse(`2026-11-13T${time}+01:00`)

  it('is not expired, says nothing, and waits until the warning is due', () => {
    expect(sessionStatus(live, at('09:30:00'))).toEqual({
      expired: false,
      warnMinutes: undefined,
      nextCheckInMilliseconds: 25 * 60_000,
    })
  })
})

describe('a session inside the last five minutes', () => {
  const live = session('2026-11-13T10:00:00+01:00')
  const at = (time: string) => Date.parse(`2026-11-13T${time}+01:00`)

  it('warns as soon as the window opens', () => {
    expect(sessionStatus(live, at('09:55:00'))).toEqual({
      expired: false,
      warnMinutes: 5,
      nextCheckInMilliseconds: 60_000,
    })
  })

  /**
   * The case a forward-only schedule gets wrong. Nothing fired the warning while this tab was
   * closed, so the warning has to be derived from the clock rather than remembered.
   */
  it('warns a returning visitor who already missed the moment it was due', () => {
    expect(sessionStatus(live, at('09:57:00')).warnMinutes).toBe(3)
    expect(sessionStatus(live, at('09:59:30')).warnMinutes).toBe(1)
  })

  it('counts down, rather than saying five minutes for five minutes', () => {
    // Half a minute in, the banner should still read 5 and change to 4 in thirty seconds —
    // not sit on its first value until the session simply ends.
    const status = sessionStatus(live, at('09:55:30'))

    expect(status.warnMinutes).toBe(5)
    expect(status.nextCheckInMilliseconds).toBe(30_000)
    expect(sessionStatus(live, at('09:56:00')).warnMinutes).toBe(4)
  })

  it('never asks to be checked again immediately, which would spin', () => {
    for (const time of ['09:55:00', '09:55:30', '09:57:00', '09:59:00', '09:59:59']) {
      expect(sessionStatus(live, at(time)).nextCheckInMilliseconds).toBeGreaterThan(0)
    }
  })
})

describe('a session that has run out', () => {
  const live = session('2026-11-13T10:00:00+01:00')

  it('is expired, with nothing left to wait for', () => {
    expect(sessionStatus(live, Date.parse('2026-11-13T10:00:00+01:00')).expired).toBe(true)
    expect(sessionStatus(live, Date.parse('2026-11-13T10:30:00+01:00')).expired).toBe(true)
  })
})

// See `MAX_TIMER_MS` in ./session.ts for what a timer does without this clamp.
describe('a session whose expiry is further off than a timer can measure', () => {
  it('asks to be checked again as late as a timer allows', () => {
    const distant = session('2099-01-01T00:00:00Z')

    expect(sessionStatus(distant, Date.parse('2026-11-13T09:00:00+01:00'))).toEqual({
      expired: false,
      warnMinutes: undefined,
      nextCheckInMilliseconds: MAX_TIMER_MS,
    })
  })
})


/**
 * The exact string a running instance returns.
 *
 * `JwtTokenService` builds `expiresAt` from a `DateTimeOffset`, and .NET serialises one with
 * **seven** fractional digits and a trailing offset:
 *
 *   "2026-11-13T18:01:26.5246027+00:00"
 *
 * ECMAScript's own date format allows three. Engines accept more in practice and truncate, but
 * that is leniency rather than specification — and `isSession` discards a session whose
 * `expiresAt` will not parse, so an engine that refused this would sign every visitor out at
 * startup and the cause would be invisible. Pinned here against the real value so the suite
 * says so instead.
 */
describe('the expiry format the API actually sends', () => {
  const asSent = '2026-11-13T18:01:26.5246027+00:00'

  it('parses, offset and all seven fractional digits', () => {
    expect(Number.isFinite(Date.parse(asSent))).toBe(true)
  })

  it('is read as an instant, not as a reading on the salon wall clock', () => {
    // The offset is honoured: the same moment written +01:00 is one hour earlier.
    expect(Date.parse('2026-11-13T18:01:26.5246027+01:00')).toBe(Date.parse(asSent) - 3_600_000)
  })

  it('carries a session through storage and back', () => {
    storeSession(session(asSent))

    expect(readStoredSession(Date.parse(asSent) - 1)?.expiresAt).toBe(asSent)
    expect(readStoredSession(Date.parse(asSent) + 1)).toBeUndefined()
  })
})
