/**
 * The session: the one thing every guarded screen reads.
 *
 * ADR-0006 gave the API bearer tokens with a sixty-minute life and no refresh. That decision
 * is absorbed here rather than argued with: the token is held for exactly as long as it is
 * useful, and the session ends cleanly instead of letting a dead token produce mystery
 * failures the visitor cannot act on.
 *
 * `sessionStorage`, not `localStorage`: it survives a refresh and dies with the tab, which is
 * about as long as a sixty-minute credential is worth anything. `localStorage` would leave the
 * token on disk past the point the visitor meant to be signed in, for a durability gain the
 * expiry makes small. See ADR-0010.
 *
 * Everything here is pure except the three functions that touch storage, and those take `now`
 * as an argument rather than reading the clock, so the expiry rule is testable without
 * pretending time has passed.
 */

import type { AuthResult, User } from '../api/dto'

export interface Session {
  readonly accessToken: string

  /**
   * When the token stops being accepted — a real instant, not a wall-clock reading.
   *
   * This is the one time in this API that is not governed by ADR-0001: `JwtTokenService`
   * builds it from `timeProvider.GetUtcNow()`, so it is a `DateTimeOffset` and arrives with
   * its zone attached. `scripts/narrow-schema.mjs` exempts it from the `WallClock` brand for
   * exactly this reason, and it is compared with `Date.parse` rather than through
   * `wallClock.ts` — a token's death is not a reading on the salon's wall.
   */
  readonly expiresAt: string

  /**
   * Who is signed in, as the API reported them. `AuthResponse` carries `user.role`, which is
   * why nothing in this application ever decodes the JWT to decide what to render.
   */
  readonly user: User
}

export const SESSION_STORAGE_KEY = 'salon.session'

export function storeSession(session: Session): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export function sessionFromAuthResult(auth: AuthResult): Session {
  return { accessToken: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user }
}

export function hasExpired(session: Session, now: number): boolean {
  return Date.parse(session.expiresAt) <= now
}

/**
 * Whether a parsed value is a session this build can use.
 *
 * Nothing but this application writes the key, so a value failing this check means a
 * half-written entry or a shape from an older build — not an attack, and not worth more than
 * discarding. A non-date `expiresAt` is rejected here specifically: `Date.parse` would give
 * `NaN`, which compares false against everything, so {@link hasExpired} would read it as *not*
 * expired and the session would never end.
 *
 * The role is deliberately not checked against `'Client' | 'Admin'`. An unrecognised role must
 * fail closed at the admin guard, which it does; throwing away an otherwise working session
 * over it would sign a client out for a reason that is none of their business.
 */
function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<Session>

  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    typeof candidate.user === 'object' &&
    candidate.user !== null &&
    typeof candidate.user.role === 'string'
  )
}

/**
 * The stored session, or `undefined` if there is not a usable one.
 *
 * A session that has expired is discarded here rather than returned and dealt with later, so
 * the application can never send a token it already knows is dead — the `401` that would come
 * back is indistinguishable from a real authorisation failure, and recovering from it would
 * cost a round trip to learn something already on disk.
 */
export function readStoredSession(now: number): Session | undefined {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (raw === null) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }

  if (!isSession(parsed)) {
    clearStoredSession()
    return undefined
  }

  const session = parsed

  if (hasExpired(session, now)) {
    clearStoredSession()
    return undefined
  }

  return session
}

// -- The one timer ----------------------------------------------------------------------

/**
 * How much warning a visitor gets. Five minutes is enough to finish choosing a slot and
 * confirm it, which is the longest thing anyone does on one screen here.
 *
 * ADR-0006 left the API with no refresh token, so there is nothing to extend: the warning is
 * the whole of what the frontend can offer, and it has to arrive in time to be useful.
 */
export const WARNING_MINUTES = 5

const WARNING_MS = WARNING_MINUTES * 60_000

/**
 * The longest delay `setTimeout` can hold: it keeps one in a signed 32-bit integer, and a
 * larger value does not wait longer — it wraps and fires on the next tick. A timer told to
 * sleep for a month would wake a millisecond later, and the only thing stopping that from
 * becoming a busy loop is the clamp in {@link sessionStatus}.
 */
export const MAX_TIMER_MS = 2_147_483_647

export interface SessionStatus {
  /** `true` once the token is past its expiry and must not be sent again. */
  expired: boolean

  /**
   * Minutes left, while inside the last {@link WARNING_MINUTES}, and `undefined` outside them.
   * Rounded up, so a visitor with four and a half minutes is told five rather than four — the
   * rounding should not take time off them.
   */
  warnMinutes: number | undefined

  /**
   * How long until this answer could change. Always greater than zero while the session is
   * live, so a caller looping on it cannot spin.
   */
  nextCheckInMilliseconds: number
}

/**
 * What the session looks like now, and when that could next change.
 *
 * Issue 04 asks for *one* timer — a warning at five minutes remaining, the session cleared at
 * expiry. Rather than give the provider a schedule to keep, the entire rule is this one pure
 * function: the provider's timer does nothing but ask again when told to.
 *
 * That shape is what makes the awkward case right. A visitor who reloads a tab with three
 * minutes left has already missed the moment the warning was due, so a timer that only
 * scheduled the warning *forwards* would never show it to them — it would sign them out with
 * no notice at all, in exactly the window where notice matters most. Deriving the warning from
 * the clock instead means there is no moment to miss.
 */
export function sessionStatus(session: Session, now: number): SessionStatus {
  const left = Date.parse(session.expiresAt) - now

  if (left <= 0) {
    return { expired: true, warnMinutes: undefined, nextCheckInMilliseconds: 0 }
  }

  if (left > WARNING_MS) {
    return {
      expired: false,
      warnMinutes: undefined,
      // Clamped, so an expiry further off than a timer can measure is waited out in stages
      // rather than wrapping round to nothing.
      nextCheckInMilliseconds: Math.min(left - WARNING_MS, MAX_TIMER_MS),
    }
  }

  const warnMinutes = Math.ceil(left / 60_000)

  return {
    expired: false,
    warnMinutes,
    // The next whole minute the count changes on — which is also the expiry itself once the
    // count reaches one, so the final wait ends exactly when the session does.
    nextCheckInMilliseconds: left - (warnMinutes - 1) * 60_000,
  }
}
