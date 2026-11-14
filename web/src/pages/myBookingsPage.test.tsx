import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  ALREADY_CANCELLED,
  api,
  availableSlots,
  booking,
  CANCEL_TOO_LATE,
  HttpResponse,
  server,
  serveMockApi,
  service,
  stylist,
} from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'
import { copyForCode } from '../lib/errorCopy'
import { addMinutes, asWallClock, nowWallClock } from '../lib/wallClock'

/**
 * `/bookings`: a client's own appointments, and the one action they have over them.
 *
 * A small screen, and the place where two things the API decided become visible to somebody.
 * ADR-0003 snapshots what a booking was agreed at, so a row has to show its own name and price
 * and not the catalogue's current ones. The **Cancellation Deadline** binds clients at two
 * hours, so the screen must not offer an action it knows will be refused — and must still cope
 * when the deadline passes under a page left open.
 *
 * `serveMockApi` fails a test on any request nothing answered, which is what keeps claims about
 * invalidation honest: a refetch that is asserted has to really have been a request.
 */

serveMockApi()

/** Far enough out that the real clock cannot reach it mid-suite. */
const UPCOMING = booking({
  id: 41,
  start: asWallClock('2099-03-04T09:00:00'),
  end: asWallClock('2099-03-04T10:00:00'),
  status: 'Scheduled',
  serviceName: 'Women’s cut',
  price: 2500,
  stylistName: 'Ana',
})

const LAST_YEAR = booking({
  id: 12,
  start: asWallClock('2020-06-01T14:00:00'),
  end: asWallClock('2020-06-01T15:00:00'),
  status: 'Completed',
  serviceName: 'Colour',
  price: 6000,
  stylistName: 'Bojan',
})

const section = (name: 'Upcoming' | 'Past') =>
  within(screen.getByRole('region', { name }))

/** Every row in a section, as one line of text each, in the order the screen lists them. */
const rows = (name: 'Upcoming' | 'Past') =>
  section(name)
    .getAllByRole('listitem')
    .map((row) => row.textContent)

describe('the list', () => {
  it('shows what is still to come above what has already happened', async () => {
    server.use(api.myBookings(() => HttpResponse.json([LAST_YEAR, UPCOMING])))

    signedInAs('Client')
    renderRoute('/bookings')

    expect(await screen.findByRole('region', { name: 'Upcoming' })).toBeInTheDocument()

    expect(rows('Upcoming')).toHaveLength(1)
    expect(rows('Upcoming')[0]).toContain('Women’s cut')
    expect(rows('Past')[0]).toContain('Colour')
  })

  /**
   * ADR-0003. The service has since been renamed and re-priced, and the row must still read
   * as what was agreed. The proof that nothing is read through to the catalogue is that no
   * handler for `/services` is registered: `serveMockApi` fails the test on any unanswered
   * request, so a page that went looking for the current price could not pass this.
   */
  it('shows the name and price the booking was agreed at, not the catalogue’s current ones', async () => {
    server.use(
      api.myBookings(() =>
        HttpResponse.json([
          booking({
            id: 60,
            start: asWallClock('2099-03-04T09:00:00'),
            end: asWallClock('2099-03-04T10:00:00'),
            serviceName: 'Ladies’ cut (as booked)',
            price: 2500,
          }),
        ]),
      ),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    expect(await screen.findByText('Ladies’ cut (as booked)')).toBeInTheDocument()
    expect(screen.getByText(/2\.500/)).toBeInTheDocument()
  })

  /**
   * "Empty state for a client with no bookings, pointing at the menu." The **menu** is `/`,
   * not `/book` — the glossary keeps the two apart, and picking a service on the menu carries
   * that choice into the booking page with one control already answered.
   */
  it('points a client with no bookings at the menu', async () => {
    server.use(api.myBookings(() => HttpResponse.json([])))

    signedInAs('Client')
    renderRoute('/bookings')

    expect(await screen.findByRole('heading', { name: /nothing booked yet/i })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /see the menu/i })).toHaveAttribute('href', '/')

    // No empty group headings underneath it: one answer, not three.
    expect(screen.queryByRole('region', { name: 'Upcoming' })).not.toBeInTheDocument()
  })

  /**
   * "A client sees only their own bookings — confirmed by signing in as a second client."
   *
   * The server half of that is the API's, and it is tested there: `GET /api/bookings/my` takes
   * no client id and reads the caller's from the JWT. What this proves is the frontend's half —
   * that the only thing deciding whose bookings appear is which session is on disk, and that
   * nothing on this screen filters, caches across identities or otherwise second-guesses the
   * answer. Two clients, two tokens, two different lists.
   */
  it('shows each client only what their own token answers for', async () => {
    const MINE = booking({ id: 41, serviceName: 'Women’s cut', clientId: 7 })
    const HERS = booking({ id: 42, serviceName: 'Balayage', clientId: 8 })

    server.use(
      api.myBookings(({ request }) =>
        HttpResponse.json(
          request.headers.get('Authorization') === 'Bearer her-token' ? [HERS] : [MINE],
        ),
      ),
    )

    signedInAs('Client')
    const mina = renderRoute('/bookings')

    expect(await screen.findByText('Women’s cut')).toBeInTheDocument()
    expect(screen.queryByText('Balayage')).not.toBeInTheDocument()

    mina.unmount()
    sessionStorage.clear()

    signedInAs('Client', undefined, { id: 8, name: 'Jovana', accessToken: 'her-token' })
    renderRoute('/bookings')

    expect(await screen.findByText('Balayage')).toBeInTheDocument()
    expect(screen.queryByText('Women’s cut')).not.toBeInTheDocument()
  })
})

describe('the deadline', () => {
  /** Inside the two hours, measured from the clock the page itself will read. */
  const soon = () =>
    booking({
      id: 77,
      start: addMinutes(nowWallClock(), 30),
      end: addMinutes(nowWallClock(), 90),
      status: 'Scheduled',
    })

  it('offers no Cancel inside two hours, and says why instead of leaving a gap', async () => {
    server.use(api.myBookings(() => HttpResponse.json([soon()])))

    signedInAs('Client')
    renderRoute('/bookings')

    // The refusal's own sentence, reached through `copyForCode` rather than retyped on the
    // row — so there is one phrasing of the rule in the application, not two.
    expect(
      await screen.findByText(copyForCode('cancellation_too_late').message),
    ).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /^cancel booking$/i })).not.toBeInTheDocument()
  })

  /**
   * A `Scheduled` booking from last June is a no-show the salon never closed out. It is past
   * the deadline, but "please call the salon" about an appointment that is months gone would be
   * nonsense — so the row says nothing at all.
   */
  it('says nothing about a booking that is simply over', async () => {
    server.use(
      api.myBookings(() =>
        HttpResponse.json([
          booking({
            id: 13,
            start: asWallClock('2020-06-01T14:00:00'),
            end: asWallClock('2020-06-01T15:00:00'),
            status: 'Scheduled',
          }),
        ]),
      ),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    expect(await screen.findByText('Scheduled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel booking$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByText(copyForCode('cancellation_too_late').message),
    ).not.toBeInTheDocument()
  })

  /**
   * The deadline can pass while the page sits open, so a client can be offered the button in
   * good faith and still be refused. The copy has to name the two hours — the API's own
   * `detail` for this code does not, and "A booking can no longer be cancelled" leaves
   * somebody with no idea why or what to do.
   */
  it('names the two hours when the request is refused anyway, rather than showing raw detail', async () => {
    server.use(
      api.myBookings(() => HttpResponse.json([UPCOMING])),
      api.cancelBooking(() => HttpResponse.json(CANCEL_TOO_LATE, { status: 409 })),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /^cancel booking$/i }))

    const dialog = within(await screen.findByRole('dialog'))
    await typist.click(dialog.getByRole('button', { name: /^yes, cancel it$/i }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(/two hours before they start/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/call the salon/i)
    expect(screen.queryByText(CANCEL_TOO_LATE.detail!)).not.toBeInTheDocument()

    // The question is still open, with the answer inside it, and the booking is untouched.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  /**
   * `booking_already_cancelled` is deliberately not in `HandledErrorCode`: the API's `detail`
   * already says the only useful thing. This is what degrading gracefully looks like, and it
   * is the reason the switch has a `default` rather than a committed list of every code.
   */
  it('falls through to the API’s own words for a code it has no copy for', async () => {
    server.use(
      api.myBookings(() => HttpResponse.json([UPCOMING])),
      api.cancelBooking(() => HttpResponse.json(ALREADY_CANCELLED, { status: 409 })),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /^cancel booking$/i }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^yes, cancel it$/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(ALREADY_CANCELLED.detail!)
  })

  it('offers nothing at all on a booking that is already settled', async () => {
    server.use(
      api.myBookings(() =>
        HttpResponse.json([
          booking({
            id: 90,
            start: asWallClock('2099-03-04T09:00:00'),
            end: asWallClock('2099-03-04T10:00:00'),
            status: 'Cancelled',
          }),
        ]),
      ),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel booking$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByText(copyForCode('cancellation_too_late').message),
    ).not.toBeInTheDocument()
  })
})

describe('cancelling', () => {
  it('asks first, then calls it off and shows the new status', async () => {
    let cancelled: number | undefined

    server.use(
      api.myBookings(() =>
        HttpResponse.json([
          cancelled === UPCOMING.id ? { ...UPCOMING, status: 'Cancelled' } : UPCOMING,
        ]),
      ),
      api.cancelBooking(({ params }) => {
        cancelled = Number(params.id)
        return HttpResponse.json({ ...UPCOMING, status: 'Cancelled' })
      }),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /^cancel booking$/i }))

    // A confirmation, naming the appointment being called off — an admin cancelling has no
    // undo and neither does a client inside two hours of the start.
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('heading').textContent).toMatch(/cancel this booking/i)

    await typist.click(dialog.getByRole('button', { name: /^yes, cancel it$/i }))

    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(cancelled).toBe(UPCOMING.id)

    // The action is gone with the status it depended on. Terminal is terminal.
    expect(screen.queryByRole('button', { name: /^cancel booking$/i })).not.toBeInTheDocument()
  })

  it('leaves the booking alone if the confirmation is declined', async () => {
    let asked = false

    server.use(
      api.myBookings(() => HttpResponse.json([UPCOMING])),
      api.cancelBooking(() => {
        asked = true
        return HttpResponse.json(UPCOMING)
      }),
    )

    signedInAs('Client')
    renderRoute('/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /^cancel booking$/i }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /keep it/i }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(asked).toBe(false)
    expect(screen.getByRole('button', { name: /^cancel booking$/i })).toBeInTheDocument()
  })
})

describe('the slot it frees', () => {
  /**
   * The ticket's own acceptance criterion: cancelling frees the slot, verified by the booking
   * page offering that start again.
   *
   * Driven as the round trip a client really makes — book page, bookings, cancel, back — so
   * the claim is about what they see rather than about a cache key. `staleTime: Infinity` is
   * what makes it bite: without it the grid would refetch on mount regardless and the test
   * would pass with the slots invalidation deleted. With it, the only thing that can make
   * `/book` ask again is having been told its answer is out of date.
   */
  it('is on offer again when the booking page is next opened', async () => {
    const DAY = '2099-03-04'
    const SLOT_URL = `/book?serviceId=3&stylistId=1&date=${DAY}`

    const MINE = booking({
      id: 41,
      start: asWallClock(`${DAY}T11:00:00`),
      end: asWallClock(`${DAY}T12:00:00`),
      status: 'Scheduled',
      stylistId: 1,
      stylistName: 'Ana',
      serviceId: 3,
      serviceName: 'Women’s cut',
    })

    let cancelled = false
    let slotsAsked = 0

    server.use(
      api.services(() => HttpResponse.json([service({ id: 3, durationMinutes: 60 })])),
      api.stylists(() => HttpResponse.json([stylist({ id: 1, name: 'Ana' })])),

      api.availableSlots(() => {
        slotsAsked += 1
        // 11:00 is taken by this client's own booking until they call it off.
        return HttpResponse.json(
          cancelled ? availableSlots(DAY, 60, '09:00', '11:00') : availableSlots(DAY, 60, '09:00'),
        )
      }),

      api.myBookings(() =>
        HttpResponse.json([cancelled ? { ...MINE, status: 'Cancelled' } : MINE]),
      ),

      api.cancelBooking(() => {
        cancelled = true
        return HttpResponse.json({ ...MINE, status: 'Cancelled' })
      }),
    )

    signedInAs('Client')
    const { router } = renderRoute(SLOT_URL, { staleTime: Infinity })

    const grid = () => screen.getByRole('group', { name: 'Available start times' })
    const offers = () =>
      within(grid())
        .getAllByRole('button')
        .map((button) => button.textContent)

    await screen.findByRole('group', { name: 'Available start times' })
    expect(offers()).toEqual(['09:00–10:00'])
    expect(slotsAsked).toBe(1)

    await router.navigate('/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /^cancel booking$/i }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^yes, cancel it$/i }),
    )

    await screen.findByText('Cancelled')

    await router.navigate(SLOT_URL)

    // The hour just given up is on offer again, because the grid was told to re-ask.
    await waitFor(() => expect(offers()).toEqual(['09:00–10:00', '11:00–12:00']))
    expect(slotsAsked).toBe(2)
  })
})
