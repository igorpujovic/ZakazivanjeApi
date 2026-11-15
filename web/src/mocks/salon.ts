/**
 * A salon in memory, for the demo the README calls `npm run dev:mock`.
 *
 * **This is not a second implementation of the API, and must never be read as one.** The API
 * in `ZakazivanjeApi/` is the specification; this is a stand-in that behaves closely enough
 * for somebody who cloned the repository to click through the application without installing
 * .NET and SQL Server. Where the two disagree, the C# is right and this is wrong.
 *
 * What it does reproduce, because the screens are uninteresting without them:
 *
 *   - Working hours per weekday, with Sunday closed, and the 15-minute slot grid.
 *   - A service has to *fit* inside working hours, so a two-and-a-half-hour colour stops being
 *     offered long before a half-hour blow dry does.
 *   - Overlap: a stylist cannot be in two places, and bookings that merely touch are fine.
 *   - A start in the past is not offered and not accepted.
 *   - The two-hour cancellation deadline, which binds clients and not admins.
 *
 * What it deliberately does not reproduce: the serializable transaction of ADR-0005 (there is
 * one tab and no contention), `booking_contended`, and anything about persistence. State lives
 * for as long as the page does. A reload is a fresh salon.
 *
 * Every value it hands back is typed from the generated schema, exactly as the test handlers
 * are, so this can drift in behaviour but not in shape.
 */

import type { Booking, Service, Stylist, User } from '../api/dto'
import { addMinutes, asWallClock, isBefore, type WallClock } from '../lib/wallClock'

/** A registered person, plus the password they registered with. Demo only, obviously. */
export interface Account {
  user: User
  password: string
  token: string
}

/** Open and close on the salon's wall, or `null` for a day it is shut. */
const WORKING_HOURS: Record<number, { open: string; close: string } | null> = {
  0: null, // Sunday
  1: { open: '09:00', close: '17:00' },
  2: { open: '09:00', close: '17:00' },
  3: { open: '09:00', close: '17:00' },
  4: { open: '09:00', close: '17:00' },
  5: { open: '09:00', close: '17:00' },
  6: { open: '09:00', close: '14:00' }, // Saturday
}

/** The grid starts are offered on, matching `WorkingHours:SlotGridMinutes`. */
const SLOT_GRID_MINUTES = 15

/** The client's deadline, in hours before the start. Admins are not bound by it. */
const CANCELLATION_DEADLINE_HOURS = 2

/** Where a tab keeps its salon between page loads. */
const STORAGE_KEY = 'salon.demo'

export class Salon {
  services: Service[] = []
  stylists: Stylist[] = []
  bookings: Booking[] = []
  accounts: Account[] = []

  private nextId = 1

  /** An id generator standing in for four identity columns. Shared, which is harmless here. */
  id(): number {
    return this.nextId++
  }

  // -- Lasting as long as the tab does ----------------------------------------------------
  //
  // Without this the salon is rebuilt on every page load, and the demo breaks in a way that
  // looks like a bug in the application rather than in the mock: a visitor registers, reloads,
  // and their session is still in `sessionStorage` while the account it names no longer
  // exists — so they appear signed in and every request they make is refused.
  //
  // `sessionStorage`, to match where the real application puts its session (ADR-0010): the
  // demo salon and the demo session then have the same lifetime, and closing the tab is what
  // resets both.

  /** Writes the salon down. Called after anything that changes it. */
  save(): void {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          services: this.services,
          stylists: this.stylists,
          bookings: this.bookings,
          accounts: this.accounts,
          nextId: this.nextId,
        }),
      )
    } catch {
      // A private window, or storage that is full or blocked. The demo still works for as
      // long as the page lives, which is better than failing to start over a convenience.
    }
  }

  /** Reads back what {@link save} wrote, and says whether there was anything to read. */
  restore(): boolean {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored === null) return false

      const state = JSON.parse(stored) as ReturnType<typeof JSON.parse>

      this.services = state.services
      this.stylists = state.stylists
      this.bookings = state.bookings
      this.accounts = state.accounts
      this.nextId = state.nextId

      return true
    } catch {
      return false
    }
  }

  // -- The catalogue --------------------------------------------------------------------

  service(id: number): Service | undefined {
    return this.services.find((s) => s.id === id)
  }

  stylist(id: number): Stylist | undefined {
    return this.stylists.find((s) => s.id === id)
  }

  // -- People ---------------------------------------------------------------------------

  accountByEmail(email: string): Account | undefined {
    // Case-insensitively, as the API compares them: nina@salon.rs and Nina@Salon.rs are one
    // account, which is the behaviour `AuthEndpointTests` pins down.
    return this.accounts.find((a) => a.user.email.toLowerCase() === email.toLowerCase())
  }

  accountByToken(token: string | undefined): Account | undefined {
    return token === undefined ? undefined : this.accounts.find((a) => a.token === token)
  }

  // -- Slots ----------------------------------------------------------------------------

  /**
   * Every start this stylist could begin this service at on this day.
   *
   * The same answer the API's `SlotFinder` gives, by the same rules: walk the grid from open
   * to close, keep a start only if the whole service finishes by closing time, drop anything
   * already in the past, and drop anything overlapping a booking this stylist still has.
   */
  availableStarts(stylistId: number, date: string, service: Service, now: WallClock): WallClock[] {
    const hours = WORKING_HOURS[weekdayOf(date)]
    if (hours === null || hours === undefined) return []

    const stylist = this.stylist(stylistId)
    if (stylist === undefined || !stylist.isActive || !service.isActive) return []

    const open = asWallClock(`${date}T${hours.open}:00`)
    const close = asWallClock(`${date}T${hours.close}:00`)

    const taken = this.bookings.filter(
      (b) => b.stylistId === stylistId && b.status === 'Scheduled',
    )

    const starts: WallClock[] = []

    for (
      let start = open;
      !isBefore(close, addMinutes(start, service.durationMinutes));
      start = addMinutes(start, SLOT_GRID_MINUTES)
    ) {
      const end = addMinutes(start, service.durationMinutes)

      if (isBefore(start, now)) continue
      if (taken.some((b) => overlaps(start, end, b.start, b.end))) continue

      starts.push(start)
    }

    return starts
  }

  /** Whether this stylist is free for the whole of a proposed booking. */
  isFree(stylistId: number, start: WallClock, end: WallClock): boolean {
    return !this.bookings.some(
      (b) =>
        b.stylistId === stylistId &&
        b.status === 'Scheduled' &&
        overlaps(start, end, b.start, b.end),
    )
  }

  /** Whether a client may still call this booking off themselves. */
  isBeforeCancellationDeadline(booking: Booking, now: WallClock): boolean {
    return isBefore(now, addMinutes(booking.start, -CANCELLATION_DEADLINE_HOURS * 60))
  }
}

/**
 * Bookings that merely touch do not overlap — one ending exactly as the next begins is two
 * bookings the salon is happy to take (GLOSSARY.md).
 */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** The weekday of a `"2026-11-20"`, read from its components so no timezone is applied. */
function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}
