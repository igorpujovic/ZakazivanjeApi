import { describe, expect, it } from 'vitest'

import { ApiError, isHandledErrorCode, NetworkError, type HandledErrorCode } from '../api/errors'
import { copyFor, copyForCode, messageFor } from './errorCopy'

/**
 * The error-code mapping: which refusals this application has its own words for, and what
 * happens to the ones it does not.
 *
 * `api/errors.ts` says there is deliberately no exhaustive list of the API's codes and no
 * completeness test, because the codes are not centralised in C# and such a test could not be
 * honest. That is not what {@link CODES} is. This is the list of codes *the UI claims to
 * handle* — a decision made in this repository, not a mirror of the server's — and it is
 * exhaustive by construction: the `Unlisted` claim below fails `tsc` if `HandledErrorCode`
 * grows a member this file does not mention.
 *
 * So the loop really does say "every handled code", and a code added to the union without
 * words of its own cannot slip past as the API's generic prose.
 */

const CODES = [
  'booking_overlap',
  'booking_contended',
  'start_in_past',
  'stylist_inactive',
  'service_inactive',
  'cancellation_too_late',
  'booking_not_started',
  'invalid_credentials',
  'email_taken',
] as const satisfies readonly HandledErrorCode[]

/** Satisfied only by `never`, which is what makes the assertion below a compile-time one. */
type NothingMissing<T extends never> = T

/** What {@link CODES} leaves out of `HandledErrorCode`. Expected to be nothing at all. */
type Unlisted = Exclude<HandledErrorCode, (typeof CODES)[number]>

/** A refusal as the wrapper hands it on: a code, and the prose the API sent beside it. */
const refusal = (code: string, detail?: string) =>
  new ApiError({ status: 409, code, title: 'Conflict', detail })

/** Stands in for the sentence the API would have sent, so a fall-through is visible. */
const GENERIC_API_PROSE = 'The generic sentence the API would have sent.'

describe('a code the UI handles', () => {
  it('is on the list below, which a union cannot be asked for at runtime', () => {
    /*
     * The claim is the annotation, not the expectation. If `HandledErrorCode` grows a member
     * `CODES` does not mention, `Unlisted` stops being `never`, `NothingMissing` refuses it,
     * and this line no longer compiles — verified against a planted violation. What follows
     * is only as much of that claim as a runtime test is able to make.
     */
    const unlisted: NothingMissing<Unlisted>[] = []

    expect(unlisted).toEqual([])
    expect(CODES).toHaveLength(new Set(CODES).size)
  })

  it.each(CODES)('has words of its own rather than the ones the API sent, for %s', (code) => {
    const copy = copyFor(refusal(code, GENERIC_API_PROSE))

    expect(copy.message).not.toBe(GENERIC_API_PROSE)
    expect(copy.message.length).toBeGreaterThan(0)
  })

  it('says something different for each one', () => {
    const messages = CODES.map((code) => copyForCode(code).message)

    expect(new Set(messages).size).toBe(CODES.length)
  })

  it('is reachable by code alone, in the same words the refusal gets', () => {
    for (const code of CODES) {
      expect(copyForCode(code)).toEqual(copyFor(refusal(code, GENERIC_API_PROSE)))
    }
  })

  it('is recognised as handled, and an invented code is not', () => {
    for (const code of CODES) expect(isHandledErrorCode(code)).toBe(true)

    // The set in `errors.ts` is maintained beside the union rather than derived from it, so
    // "the type says handled" and "`isHandledErrorCode` agrees" are two claims, not one.
    expect(isHandledErrorCode('booking_already_cancelled')).toBe(false)
    expect(isHandledErrorCode(undefined)).toBe(false)
  })

  it('names what the screen should do next, not only what to say', () => {
    /*
     * The recovery is the half of the mapping a screen acts on, and every handled code names
     * one. `useConfirmBooking` branches on three of the five — refetch the slots, refetch the
     * catalogue, or offer the button again — while `show-field` belongs to the register form,
     * which puts the complaint on the email box, and `none` means the sentence was the whole
     * remedy. Asserted by code because a wrong one is silent: the words would still read
     * correctly while the grid went on offering a time that is gone.
     */
    expect(copyForCode('booking_overlap').recovery).toBe('refetch-slots')
    expect(copyForCode('start_in_past').recovery).toBe('refetch-slots')
    expect(copyForCode('booking_contended').recovery).toBe('retry')
    expect(copyForCode('stylist_inactive').recovery).toBe('refetch-catalogue')
    expect(copyForCode('service_inactive').recovery).toBe('refetch-catalogue')
    expect(copyForCode('email_taken').recovery).toBe('show-field')
    expect(copyForCode('cancellation_too_late').recovery).toBe('none')
  })
})

describe('a code the UI does not handle', () => {
  it('falls through to the detail the API sent, which is what detail is for', () => {
    // A real code, from the API's `409` table, that the admin screens react to with a refetch
    // rather than with better words. See issue 07.
    const detail = 'That booking has already been cancelled.'
    const copy = copyFor(refusal('booking_already_cancelled', detail))

    expect(copy).toEqual({ message: detail, recovery: 'none' })
  })

  it('falls through for a code this build has never heard of', () => {
    const copy = copyFor(refusal('booking_requires_deposit', 'A deposit is required.'))

    expect(copy.message).toBe('A deposit is required.')
  })

  it('reads sensibly when there is no detail either', () => {
    // A `500` carries none, on purpose: an exception message is the one string that could name
    // a table or a connection string, so the API logs it and drops it (ADR-0008). This is the
    // case that reaches the generic line, which is why that line has to be worth reading.
    const copy = copyFor(new ApiError({ status: 500, code: 'internal_error' }))

    expect(copy).toEqual({ message: 'Something went wrong. Please try again.', recovery: 'none' })
  })
})

describe('one line for anything that went wrong', () => {
  it('gives a refusal the words that belong to it', () => {
    expect(messageFor(refusal('booking_overlap'))).toBe(copyForCode('booking_overlap').message)
  })

  it('tells the salon being unreachable apart from the salon saying no', () => {
    const unreachable = messageFor(new NetworkError())

    expect(unreachable).toMatch(/could not reach/i)
    expect(unreachable).not.toBe(messageFor(refusal('booking_overlap')))
  })

  it('reports an ordinary thrown error in its own words', () => {
    expect(messageFor(new TypeError('x is not a function'))).toBe('x is not a function')
  })

  it('still says something for a value that is not an error at all', () => {
    expect(messageFor('a string nobody should have thrown')).toBe(
      'Something went wrong. Please try again.',
    )
    expect(messageFor(undefined)).toBe('Something went wrong. Please try again.')
  })
})
