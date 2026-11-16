import { describe, expect, it } from 'vitest'

import { iconForService } from './serviceIcon'
import {
  AirIcon,
  BeardIcon,
  ClippersIcon,
  CombIcon,
  DropletIcon,
  RazorIcon,
  ScissorsIcon,
  TowelIcon,
} from '../ui/icons'

/**
 * The guessing, written down.
 *
 * The icon is decoration, so none of this is load-bearing — but the *order* of the rules is
 * the only thing keeping "beard trim" from coming out as a comb, and an order is exactly the
 * sort of thing that survives being rearranged by somebody adding a keyword unless a test
 * objects.
 */

describe('the icon beside a service', () => {
  /*
   * The six `SampleCatalogue.cs` seeds, which are the six a reader sees on first run and the
   * six in the README's screenshots. Any of them coming out as the fallback would mean the
   * menu a reviewer opens is a column of identical scissors.
   */
  it('reads the names the API seeds the catalogue with', () => {
    expect(iconForService('Haircut')).toBe(ScissorsIcon)
    expect(iconForService('Skin fade')).toBe(ClippersIcon)
    expect(iconForService('Beard trim')).toBe(BeardIcon)
    expect(iconForService('Hot towel shave')).toBe(RazorIcon)
    expect(iconForService('Cut and beard')).toBe(BeardIcon)

    // The one the fallback is for: nothing in ‘The works’ says what it is, and scissors in a
    // barbershop is never the wrong guess.
    expect(iconForService('The works')).toBe(ScissorsIcon)
  })

  it('knows the rest of a hairdresser’s menu, since an admin may add one', () => {
    expect(iconForService('Colouring')).toBe(DropletIcon)
    expect(iconForService('Blow Dry')).toBe(AirIcon)
    expect(iconForService('Wash and Style')).toBe(DropletIcon)
    expect(iconForService('Kids cut')).toBe(ScissorsIcon)
    expect(iconForService('Hot towel treatment')).toBe(TowelIcon)
  })

  it('lets the specific word win over the general one', () => {
    // "trim" would find the comb and "towel" the towel; both sit below what the service is.
    expect(iconForService('Beard trim')).toBe(BeardIcon)
    expect(iconForService('Hot towel shave')).toBe(RazorIcon)
    expect(iconForService('Neck trim')).toBe(CombIcon)
  })

  it('does not care about case, and reads the local words too', () => {
    expect(iconForService('ŠIŠANJE')).toBe(ScissorsIcon)
    expect(iconForService('brijanje glave')).toBe(RazorIcon)
    expect(iconForService('Feniranje')).toBe(AirIcon)
  })

  it('falls back to scissors, which is never wrong in a barbershop', () => {
    expect(iconForService('Something nobody has thought of')).toBe(ScissorsIcon)
    expect(iconForService('')).toBe(ScissorsIcon)
  })
})
