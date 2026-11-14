import { describe, expect, it } from 'vitest'

import {
  createServiceBody,
  createStylistBody,
  serviceDraftFrom,
  stylistDraftFrom,
  updateServiceBody,
  updateStylistBody,
} from './catalogueDraft'

/**
 * What the panel sends, and what it starts from.
 *
 * Two things make this worth testing away from React. Both `PUT`s are **full replacements**
 * carrying a required `isActive`, so a body missing a field is not a smaller change but a
 * different one — renaming a withdrawn service by sending no flag would quietly put it back on
 * the menu, which is exactly what `UpdateServiceRequest` says it refuses to let happen. And an
 * `<input>` holds a string whatever its `type`, so the numbers crossing to the API are a
 * conversion with edge cases rather than a value being passed along.
 */

const WOMENS_CUT = {
  id: 3,
  name: 'Women’s cut',
  durationMinutes: 60,
  price: 2500,
  isActive: true,
}

describe('the draft a panel opens with', () => {
  it('is empty for a new service, so nothing is chosen on the admin’s behalf', () => {
    expect(serviceDraftFrom(undefined)).toEqual({ name: '', durationMinutes: '', price: '' })
    expect(stylistDraftFrom(undefined)).toEqual({ name: '' })
  })

  it('holds the service as it stands, as strings an input can carry', () => {
    expect(serviceDraftFrom(WOMENS_CUT)).toEqual({
      name: 'Women’s cut',
      durationMinutes: '60',
      price: '2500',
    })
  })

  /**
   * A price is `decimal(10,2)` in the database and a `double` on the wire, so the pennies have
   * to survive the round trip into an input and back out of it.
   */
  it('keeps a price’s pennies', () => {
    const draft = serviceDraftFrom({ ...WOMENS_CUT, price: 2499.5 })

    expect(draft.price).toBe('2499.5')
    expect(createServiceBody(draft).price).toBe(2499.5)
  })
})

describe('creating', () => {
  /**
   * `CreateServiceRequest` has no `IsActive` at all: a service nobody could book is not worth
   * creating, so a new one is always on the menu. Sending the flag would be sending a field
   * the API does not have.
   */
  it('sends no isActive, because a new service is always on the menu', () => {
    const body = createServiceBody({ name: 'Beard trim', durationMinutes: '30', price: '1200' })

    expect(body).toEqual({ name: 'Beard trim', durationMinutes: 30, price: 1200 })
    expect('isActive' in body).toBe(false)
  })

  it('sends a stylist’s name and nothing else', () => {
    const body = createStylistBody({ name: 'Bojan' })

    expect(body).toEqual({ name: 'Bojan' })
  })
})

describe('updating', () => {
  /**
   * The flag is required rather than defaulted, and this is why: an update carries whatever
   * the row already was, so correcting a typo in a withdrawn service's name cannot put it back
   * on the menu as a side effect.
   */
  it('carries the activation the row already had', () => {
    const draft = serviceDraftFrom({ ...WOMENS_CUT, isActive: false })

    expect(updateServiceBody(draft, false)).toEqual({
      name: 'Women’s cut',
      durationMinutes: 60,
      price: 2500,
      isActive: false,
    })

    expect(updateStylistBody({ name: 'Ana' }, false)).toEqual({ name: 'Ana', isActive: false })
  })

  /** The same `PUT` is how a withdrawn service comes back, there being no other route for it. */
  it('is also how something is put back on the menu', () => {
    expect(updateServiceBody(serviceDraftFrom(WOMENS_CUT), true).isActive).toBe(true)
    expect(updateStylistBody({ name: 'Ana' }, true).isActive).toBe(true)
  })
})

describe('the numbers', () => {
  /**
   * A number input empties to `""` when its contents are not a number — a half-typed `"1e"`,
   * say — rather than holding the characters. `required` is what stops an empty one being
   * submitted; this is about what the conversion does if one ever arrives, and the answer has
   * to be a number the API will refuse rather than a `NaN` that `JSON.stringify` writes as
   * `null` and the API reads as a missing field.
   */
  it('turns an unusable duration or price into a number the API refuses', () => {
    const body = createServiceBody({ name: 'Nameless', durationMinutes: '', price: '' })

    expect(body.durationMinutes).toBe(0)
    expect(body.price).toBe(0)
    expect(Number.isNaN(body.durationMinutes)).toBe(false)
  })

  /**
   * Not trimmed here. The API trims during binding and then refuses a name that trimmed away
   * to nothing, with the complaint landing on the name field — so trimming on the way out
   * would hide that rule rather than honour it, and the panel would send a different name from
   * the one in the box.
   */
  it('sends a name exactly as it was typed, spaces and all', () => {
    expect(createStylistBody({ name: '   ' })).toEqual({ name: '   ' })
  })
})
