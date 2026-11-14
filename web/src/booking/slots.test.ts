import { describe, expect, it } from 'vitest'

import { asWallClock } from '../lib/wallClock'
import { mergeSlots, type StylistAnswer } from './slots'

/**
 * The fan-out merge: what "No preference" means, expressed as data.
 *
 * The API answers for one stylist on one day, so a visitor who does not care which stylist
 * they see is served by asking every active stylist and merging the answers. These are the
 * rules that merge keeps, and the reason each of them is a rule is in `slots.ts`.
 *
 * Expected values are written out as literal times rather than derived from the inputs, so a
 * merge that reversed its ordering or dropped a stylist could not still agree with the test.
 */

const answer = (
  stylistId: number,
  stylistName: string,
  ...slots: string[]
): StylistAnswer => ({
  stylistId,
  stylistName,
  slots: slots.map((value) => asWallClock(`2026-11-20T${value}:00`)),
})

/** `09:00 Ana, 10:00 Bojan` — compact enough to read the whole expectation at a glance. */
const readable = (slots: ReturnType<typeof mergeSlots>) =>
  slots.map((slot) => `${slot.start.slice(11, 16)} ${slot.stylistName}`)

describe('merging one stylist', () => {
  it('offers that stylist every start they answered with, in order', () => {
    const merged = mergeSlots([answer(1, 'Ana', '09:00', '09:30', '10:00')])

    expect(readable(merged)).toEqual(['09:00 Ana', '09:30 Ana', '10:00 Ana'])
    expect(merged.map((slot) => slot.stylistId)).toEqual([1, 1, 1])
  })

  it('answers with nothing when the day has nothing free', () => {
    expect(mergeSlots([answer(1, 'Ana')])).toEqual([])
  })
})

describe('merging several stylists', () => {
  it('interleaves their starts into one ascending grid, each labelled', () => {
    const merged = mergeSlots([
      answer(1, 'Ana', '09:00', '11:00'),
      answer(2, 'Bojan', '10:00', '12:00'),
    ])

    expect(readable(merged)).toEqual(['09:00 Ana', '10:00 Bojan', '11:00 Ana', '12:00 Bojan'])
  })

  it('still ascends when the stylist answering later holds the earlier times', () => {
    const merged = mergeSlots([
      answer(1, 'Ana', '15:00', '16:00'),
      answer(2, 'Bojan', '09:00', '09:30'),
    ])

    expect(readable(merged)).toEqual([
      '09:00 Bojan',
      '09:30 Bojan',
      '15:00 Ana',
      '16:00 Ana',
    ])
  })

  it('offers a start once, not once per stylist who is free then', () => {
    const merged = mergeSlots([
      answer(1, 'Ana', '09:00', '10:00'),
      answer(2, 'Bojan', '09:00', '11:00'),
      answer(3, 'Vesna', '09:00'),
    ])

    expect(readable(merged)).toEqual(['09:00 Ana', '10:00 Ana', '11:00 Bojan'])
  })

  it('attributes a shared start to the stylist the catalogue lists first', () => {
    const [first] = mergeSlots([answer(4, 'Zoran', '09:00'), answer(2, 'Bojan', '09:00')])

    expect(first).toEqual({ start: '2026-11-20T09:00:00', stylistId: 4, stylistName: 'Zoran' })
  })

  it('has nothing to offer when every stylist is fully booked', () => {
    expect(mergeSlots([answer(1, 'Ana'), answer(2, 'Bojan')])).toEqual([])
  })

  it('answers with nothing when there is nobody to ask', () => {
    expect(mergeSlots([])).toEqual([])
  })
})
