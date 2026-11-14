import { describe, expect, it } from 'vitest'

import { asWallClockDate } from '../lib/wallClock'
import { isReadyToShowSlots, searchFor, selectionFrom } from './selection'

/**
 * The booking page keeps its state in the address bar, so a choice is linkable and the back
 * button works without the page doing anything to earn it. That makes the query string an
 * input from outside — typed, pasted, bookmarked, or stale — and this is where it is read
 * sceptically.
 */

describe('reading a booking page address', () => {
  it('reads the three choices the spec puts in the URL', () => {
    expect(selectionFrom('?serviceId=3&stylistId=1&date=2026-11-20')).toEqual({
      serviceId: 3,
      stylistId: 1,
      date: '2026-11-20',
    })
  })

  it('treats an absent stylist as No preference rather than as missing information', () => {
    expect(selectionFrom('?serviceId=3&date=2026-11-20')).toEqual({
      serviceId: 3,
      stylistId: undefined,
      date: '2026-11-20',
    })
  })

  it('starts from nothing chosen when the address carries nothing', () => {
    expect(selectionFrom('')).toEqual({
      serviceId: undefined,
      stylistId: undefined,
      date: undefined,
    })
  })

  it('ignores an id that is not one, rather than asking the API about it', () => {
    for (const bad of ['abc', '', '0', '-4', '2.5', '3e2', ' ']) {
      expect(selectionFrom(`?serviceId=${encodeURIComponent(bad)}&date=2026-11-20`)).toEqual({
        serviceId: undefined,
        stylistId: undefined,
        date: '2026-11-20',
      })
    }
  })

  it('ignores a date that is not a wall-clock date', () => {
    for (const bad of ['tomorrow', '20-11-2026', '2026-11-20T09:00:00', '']) {
      expect(selectionFrom(`?serviceId=3&date=${encodeURIComponent(bad)}`).date).toBeUndefined()
    }
  })
})

/** A raw string cannot reach a `WallClockDate` position, so a test does not get to either. */
const day = asWallClockDate

describe('writing one back', () => {
  it('writes every choice that was made', () => {
    expect(searchFor({ serviceId: 3, stylistId: 1, date: day('2026-11-20') })).toBe(
      'serviceId=3&stylistId=1&date=2026-11-20',
    )
  })

  it('leaves No preference out, so the default never clutters the address', () => {
    expect(searchFor({ serviceId: 3, stylistId: undefined, date: day('2026-11-20') })).toBe(
      'serviceId=3&date=2026-11-20',
    )
  })

  it('writes a partial choice, because the page is linkable before it is finished', () => {
    expect(searchFor({ serviceId: 3, stylistId: undefined, date: undefined })).toBe('serviceId=3')
    expect(searchFor({ serviceId: undefined, stylistId: undefined, date: undefined })).toBe('')
  })

  it('round-trips, so navigating cannot quietly lose a choice', () => {
    const selection = { serviceId: 12, stylistId: 4, date: day('2026-12-01') }
    expect(selectionFrom(`?${searchFor(selection)}`)).toEqual(selection)
  })
})

describe('knowing when to ask the API', () => {
  it('waits for a service and a day, the two the endpoint cannot answer without', () => {
    expect(isReadyToShowSlots({ serviceId: 3, stylistId: 1, date: day('2026-11-20') })).toBe(true)
    expect(isReadyToShowSlots({ serviceId: 3, stylistId: undefined, date: day('2026-11-20') })).toBe(
      true,
    )
    expect(isReadyToShowSlots({ serviceId: undefined, stylistId: 1, date: day('2026-11-20') })).toBe(
      false,
    )
    expect(isReadyToShowSlots({ serviceId: 3, stylistId: 1, date: undefined })).toBe(false)
  })
})
