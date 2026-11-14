/**
 * What a person is told when the API refuses.
 *
 * The API's `detail` is correct and readable prose, and for most codes it is what we show.
 * This module exists for the handful where the UI can say something *better* than a generic
 * sentence — because it knows what the visitor was trying to do and what to do next.
 *
 * Anything not listed here falls through to `detail`, deliberately. See `api/errors.ts`.
 */

import { isApiError, isHandledErrorCode, type ApiError, type HandledErrorCode } from '../api/errors'

export interface ErrorCopy {
  /** One line, addressed to the person, saying what happened. */
  message: string
  /** What the UI should do about it, so a screen does not have to re-derive it. */
  recovery: 'refetch-slots' | 'retry' | 'refetch-catalogue' | 'show-field' | 'none'
}

const COPY: Record<HandledErrorCode, ErrorCopy> = {
  // The slot was taken between being offered and being confirmed. A slot is an offer, not a
  // hold (GLOSSARY.md), so this is normal operation. Retrying the same time cannot work.
  booking_overlap: {
    message: 'That time was just taken by someone else. Here is what is still free.',
    recovery: 'refetch-slots',
  },

  // The API retried three times and wrote nothing, then said to try again — so we offer that
  // rather than inventing a different story. ADR-0005.
  booking_contended: {
    message: 'The schedule is busy being changed right now. Try that again.',
    recovery: 'retry',
  },

  // They sat on the page until the start time passed. Refetching drops the stale slots.
  start_in_past: {
    message: 'That time has already passed. These are the times still available today.',
    recovery: 'refetch-slots',
  },

  stylist_inactive: {
    message: 'That stylist is no longer taking appointments. Choose another.',
    recovery: 'refetch-catalogue',
  },

  service_inactive: {
    message: 'That service is no longer on the menu. Choose another.',
    recovery: 'refetch-catalogue',
  },

  // The deadline is the client's, not the salon's: two hours, and admins are not bound by it.
  cancellation_too_late: {
    message:
      'Bookings can only be cancelled up to two hours before they start. Please call the salon.',
    recovery: 'none',
  },

  /*
   * Not a refusal this application ever provokes, and that is the point of having the words
   * here: `/admin/bookings` disables Complete until the start has passed, and the sentence
   * explaining why has to be the one the refusal would have used. `copyForCode` is how the
   * screen reaches it, exactly as `/bookings` reaches the deadline's.
   *
   * "Completed" rather than "done", which `GLOSSARY.md` lists as a word to avoid for it.
   */
  booking_not_started: {
    message: 'A booking can only be completed once it has started.',
    recovery: 'none',
  },

  // The API answers identically for an unknown email and a wrong password, on purpose, so the
  // endpoint cannot be used to find out who has an account. The UI must not undermine that by
  // being more specific than the API was.
  invalid_credentials: {
    message: 'That email and password do not match an account.',
    recovery: 'none',
  },

  email_taken: {
    message: 'An account with that email already exists.',
    recovery: 'show-field',
  },
}

const FALLBACK: ErrorCopy = {
  message: 'Something went wrong. Please try again.',
  recovery: 'none',
}

/**
 * The copy for a refusal.
 *
 * For a code we handle, our own words. For anything else, the API's `detail` — which its
 * README states is prose for a human — and only if that is missing, a generic line. A `500`
 * carries no `detail` on purpose, so that last case is reached and must read sensibly.
 */
export function copyFor(error: ApiError): ErrorCopy {
  if (isHandledErrorCode(error.code)) return COPY[error.code]
  if (error.detail !== undefined) return { message: error.detail, recovery: 'none' }
  return FALLBACK
}

/**
 * The copy for a code, with no refusal in hand.
 *
 * For the screen that knows a thing is withdrawn without having been refused — a stale link
 * naming a service that is no longer on the menu, say. The words have to be the same ones the
 * refusal would have used, so this is the way to reach them rather than retyping the sentence
 * somewhere it could drift from this file.
 */
export function copyForCode(code: HandledErrorCode): ErrorCopy {
  return COPY[code]
}

/**
 * One line for anything that went wrong, refusal or not.
 *
 * Every screen needs this and none of them should have to spell out the three cases: the API
 * refused and we have words for it, the API could not be reached, or something unforeseen.
 * See `NetworkError` for why the first two are worth telling apart.
 */
export function messageFor(error: unknown): string {
  if (isApiError(error)) return copyFor(error).message
  if (error instanceof Error) return error.message
  return FALLBACK.message
}
