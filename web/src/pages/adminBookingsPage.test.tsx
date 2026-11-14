import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  ALREADY_CANCELLED,
  ALREADY_COMPLETED,
  api,
  booking,
  HttpResponse,
  pagedBookings,
  server,
  serveMockApi,
  stylist,
} from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'
import { copyForCode } from '../lib/errorCopy'
import { addMinutes, asWallClock, nowWallClock, todayWallClockDate } from '../lib/wallClock'

/**
 * `/admin/bookings`: the receptionist's screen, and the only caller of the one paginated
 * endpoint in the API.
 *
 * Three things make this worth a page test rather than only unit tests. The endpoint orders by
 * `Start` then `Id` ascending, so a screen that asked it nothing would open on the oldest
 * bookings in salon history — the default has to be a request that really carries today.
 * Paging is the API's own numbers, so the footer has to be shown reporting what came back
 * rather than what was asked for. And two admins on the same day is a real situation, so a
 * refusal saying somebody got there first has to be shown refetching.
 *
 * `serveMockApi` fails a test on any request nothing answered, which is what keeps every claim
 * about a refetch honest: an assertion that the screen asked again has to be a real request.
 */

serveMockApi()

/** The day the screen opens on, which is the one thing about it that cannot be hard-coded. */
const TODAY = todayWallClockDate()

const MINA = booking({
  id: 41,
  start: asWallClock(`${TODAY}T09:00:00`),
  end: asWallClock(`${TODAY}T10:00:00`),
  status: 'Scheduled',
  clientName: 'Mina Marić',
  stylistName: 'Ana',
  serviceName: 'Women’s cut',
  price: 2500,
})

const ANA = stylist({ id: 1, name: 'Ana' })
const BOJAN = stylist({ id: 2, name: 'Bojan', isActive: false })

/** Every query string the screen sent to the list endpoint, in order. */
function recordRequests() {
  const asked: URLSearchParams[] = []

  const handler = api.bookings(({ request }) => {
    asked.push(new URL(request.url).searchParams)
    return HttpResponse.json(pagedBookings([MINA]))
  })

  return { asked, handler }
}

describe('the day', () => {
  /**
   * The ticket's first line: opening the page shows today, not 2019. Proved on the request,
   * not on the rendered rows — a screen rendering today's bookings because the mock answered
   * with today's bookings would pass a weaker test with the default deleted.
   */
  it('asks for today rather than for the oldest bookings in salon history', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA, BOJAN])), handler)

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    expect(await screen.findByText('Mina Marić')).toBeInTheDocument()
    expect(asked[0].get('Date')).toBe(TODAY)
  })

  /** A link pasted from a message, which has to restore the day it was taken on. */
  it('shows the day the address names', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA])), handler)

    signedInAs('Admin')
    renderRoute('/admin/bookings?date=2026-11-20')

    expect(await screen.findByText('Mina Marić')).toBeInTheDocument()
    expect(asked[0].get('Date')).toBe('2026-11-20')
  })

  it('moves the day and the address together', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA])), handler)

    signedInAs('Admin')
    const { currentPath } = renderRoute('/admin/bookings?date=2026-11-20')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: 'Previous day' }))

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].get('Date')).toBe('2026-11-19')
    expect(currentPath()).toBe('/admin/bookings?date=2026-11-19')

    await typist.click(screen.getByRole('button', { name: 'Next day' }))

    await waitFor(() => expect(asked).toHaveLength(3))
    expect(asked[2].get('Date')).toBe('2026-11-20')
    expect(currentPath()).toBe('/admin/bookings?date=2026-11-20')
  })

  /**
   * The escape hatch. The request carries no day at all — which is what makes the endpoint
   * answer with the oldest bookings in salon history — and the screen has to say that is what
   * it is doing, because a receptionist looking at 2019 would otherwise read it as a fault.
   */
  it('asks for no day at all when the day is cleared, and says so', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA])), handler)

    signedInAs('Admin')
    const { currentPath } = renderRoute('/admin/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /every booking ever/i }))

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].has('Date')).toBe(false)
    expect(currentPath()).toBe('/admin/bookings?date=all')

    expect(screen.getByText(/every booking the salon has ever taken, oldest first/i))
      .toBeInTheDocument()
  })

  /** And back again, because the way out of the whole history has to be as plain as the way in. */
  it('comes back to today from the whole history', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA])), handler)

    signedInAs('Admin')
    renderRoute('/admin/bookings?date=all')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: /back to today/i }))

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].get('Date')).toBe(TODAY)
  })

  /** There is no day to move in the whole-history view, so neither button pretends there is. */
  it('offers no day to move in the whole history', async () => {
    const { handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA])), handler)

    signedInAs('Admin')
    renderRoute('/admin/bookings?date=all')

    expect(await screen.findByRole('button', { name: 'Previous day' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })
})

describe('paging', () => {
  const DAY = '2026-11-20'

  /** More than one page of a single day, each row nameable so a repeat would be visible. */
  const everyone = Array.from({ length: 25 }, (_, index) =>
    booking({
      id: index + 1,
      start: asWallClock(`${DAY}T09:00:00`),
      end: asWallClock(`${DAY}T10:00:00`),
      clientName: `Client ${index + 1}`,
    }),
  )

  /** The endpoint, paging honestly: twenty a page, and the counts it really answers with. */
  const pagedHandler = () =>
    api.bookings(({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('Page') ?? '1')

      return HttpResponse.json(
        pagedBookings(everyone.slice((page - 1) * 20, page * 20), {
          page,
          pageSize: 20,
          totalCount: everyone.length,
          totalPages: 2,
        }),
      )
    })

  it('pages through a day without repeating or skipping a row', async () => {
    server.use(api.stylists(() => HttpResponse.json([ANA])), pagedHandler())

    signedInAs('Admin')
    const { currentPath } = renderRoute(`/admin/bookings?date=${DAY}`)

    const typist = userEvent.setup()

    expect(await screen.findByText('Showing 1–20 of 25')).toBeInTheDocument()
    expect(screen.getByText('Client 1')).toBeInTheDocument()
    expect(screen.getByText('Client 20')).toBeInTheDocument()
    expect(screen.queryByText('Client 21')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await typist.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Showing 21–25 of 25')).toBeInTheDocument()
    expect(screen.getByText('Client 21')).toBeInTheDocument()
    expect(screen.getByText('Client 25')).toBeInTheDocument()

    // The row either side of the seam: page two starts where page one stopped, and neither
    // the last row of the first page nor any earlier one is shown twice.
    expect(screen.queryByText('Client 20')).not.toBeInTheDocument()
    expect(screen.queryByText('Client 1')).not.toBeInTheDocument()

    expect(currentPath()).toBe(`/admin/bookings?date=${DAY}&page=2`)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  /** The day is kept while paging, and the page is not kept while changing the day. */
  it('starts the next day at its first page', async () => {
    const asked: URLSearchParams[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          pagedBookings([everyone[0]], { page: 1, totalCount: 25, totalPages: 2 }),
        )
      }),
    )

    signedInAs('Admin')
    const { currentPath } = renderRoute(`/admin/bookings?date=${DAY}&page=2`)

    const typist = userEvent.setup()

    await waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0].get('Page')).toBe('2')

    await typist.click(await screen.findByRole('button', { name: 'Next day' }))

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].get('Date')).toBe('2026-11-21')
    expect(asked[1].has('Page')).toBe(false)
    expect(currentPath()).toBe('/admin/bookings?date=2026-11-21')
  })

  /**
   * The cap, which is why a page size can be asked for at all. `BookingsQuery` caps `PageSize`
   * at a hundred **rather than refusing it**, and the response says which size it used — so the
   * footer has to report that and not the five hundred the address asked for.
   */
  it('reports the page size the API used, not the one that was asked for', async () => {
    const asked: URLSearchParams[] = []

    const hundred = Array.from({ length: 100 }, (_, index) =>
      booking({
        id: index + 1,
        start: asWallClock(`${DAY}T09:00:00`),
        end: asWallClock(`${DAY}T10:00:00`),
        clientName: `Client ${index + 1}`,
      }),
    )

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          pagedBookings(hundred, { page: 1, pageSize: 100, totalCount: 143, totalPages: 2 }),
        )
      }),
    )

    signedInAs('Admin')
    renderRoute(`/admin/bookings?date=${DAY}&pageSize=500`)

    expect(await screen.findByText('Showing 1–100 of 143')).toBeInTheDocument()
    expect(asked[0].get('PageSize')).toBe('500')
  })

  /** A day the salon took nothing. An answer, not a failure — and the way out is named. */
  it('says a day is empty rather than showing an empty table', async () => {
    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() => HttpResponse.json(pagedBookings([], { totalCount: 0, totalPages: 0 }))),
    )

    signedInAs('Admin')
    renderRoute(`/admin/bookings?date=${DAY}`)

    expect(await screen.findByRole('heading', { name: 'Nothing booked' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  /**
   * A pasted or hand-edited page number past the end, which the API answers with an empty page
   * rather than a refusal. The screen has to say what happened and offer a way back worth
   * taking: the last page that has anything on it, not the one before this one, which would be
   * just as empty and ninety clicks from the bookings.
   */
  it('offers a way back from a page past the end', async () => {
    const asked: URLSearchParams[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        const params = new URL(request.url).searchParams
        asked.push(params)

        const page = Number(params.get('Page') ?? '1')

        return HttpResponse.json(
          page > 8
            ? pagedBookings([], { page, totalCount: 143, totalPages: 8 })
            : pagedBookings([everyone[0]], { page, totalCount: 143, totalPages: 8 }),
        )
      }),
    )

    signedInAs('Admin')
    const { currentPath } = renderRoute(`/admin/bookings?date=${DAY}&page=99`)

    const typist = userEvent.setup()

    expect(await screen.findByText(/that page is past the end/i)).toBeInTheDocument()
    expect(screen.getByText('Page 99 of 8 — there is nothing here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    const previous = screen.getByRole('button', { name: 'Previous' })
    expect(previous).toBeEnabled()

    await typist.click(previous)

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].get('Page')).toBe('8')
    expect(currentPath()).toBe(`/admin/bookings?date=${DAY}&page=8`)
  })
})

describe('the stylist', () => {
  it('narrows the day to one stylist, in the address too', async () => {
    const { asked, handler } = recordRequests()
    server.use(api.stylists(() => HttpResponse.json([ANA, BOJAN])), handler)

    signedInAs('Admin')
    const { currentPath } = renderRoute('/admin/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('combobox', { name: 'Stylist' }))
    await typist.click(await screen.findByRole('option', { name: 'Ana' }))

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].get('StylistId')).toBe('1')
    expect(currentPath()).toBe(`/admin/bookings?date=${TODAY}&stylistId=1`)
  })

  /**
   * ADR-0012's admin view of the catalogue, and the reason this screen asks for it. A retired
   * stylist keeps every booking they ever had, so a filter that could not name them would make
   * those days unfilterable — which is exactly the gap `includeInactive` was added to close.
   */
  it('still offers a stylist the salon has retired', async () => {
    const { handler } = recordRequests()

    const asked: URLSearchParams[] = []
    server.use(
      api.stylists(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json([ANA, BOJAN])
      }),
      handler,
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('combobox', { name: 'Stylist' }))

    expect(await screen.findByRole('option', { name: 'Bojan (inactive)' })).toBeInTheDocument()
    expect(asked[0].get('includeInactive')).toBe('true')
  })
})

describe('the rows', () => {
  /**
   * No status filter, and none faked. The endpoint has none, and dropping cancelled rows from a
   * page of twenty would make "20 of 143" a lie — besides which a day's cancelled bookings are
   * arguably what a receptionist most needs to see, being hours that have come free.
   */
  it('keeps cancelled and completed bookings in the day, with their badges', async () => {
    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() =>
        HttpResponse.json(
          pagedBookings([
            booking({ id: 1, clientName: 'Mina Marić', status: 'Scheduled' }),
            booking({ id: 2, clientName: 'Jovana Ilić', status: 'Cancelled' }),
            booking({ id: 3, clientName: 'Petar Nikolić', status: 'Completed' }),
          ]),
        ),
      ),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    expect(await screen.findByText('Mina Marić')).toBeInTheDocument()
    expect(screen.getByText('Jovana Ilić')).toBeInTheDocument()
    expect(screen.getByText('Petar Nikolić')).toBeInTheDocument()

    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()

    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument()
  })

  /** `BookingResponse` carries `clientName`, so no second call is made to find out who booked. */
  it('names the client without a second call', async () => {
    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() => HttpResponse.json(pagedBookings([MINA]))),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    const row = await screen.findByRole('row', { name: /Mina Marić/ })

    expect(row).toHaveTextContent('Ana')
    expect(row).toHaveTextContent('Women’s cut')
    expect(row).toHaveTextContent(/2\.500/)
  })
})

describe('calling a booking off', () => {
  /** Ten minutes out: inside the two hours that would refuse a client. */
  const imminent = () => {
    const start = addMinutes(nowWallClock(), 10)

    return booking({
      id: 41,
      start,
      end: addMinutes(start, 60),
      status: 'Scheduled',
      clientName: 'Mina Marić',
    })
  }

  it('asks first, and sends nothing until the question is answered', async () => {
    const cancelled: string[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() => HttpResponse.json(pagedBookings([imminent()]))),
      api.cancelBooking(({ params }) => {
        cancelled.push(String(params.id))
        return HttpResponse.json(booking({ id: 41, status: 'Cancelled' }))
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: 'Cancel' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Mina Marić')
    expect(cancelled).toHaveLength(0)

    await typist.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(cancelled).toHaveLength(0)
  })

  /**
   * ADR-0004, and the ticket's own line: the **Cancellation Deadline** binds clients only. A
   * booking starting in ten minutes is one a client could no longer call off, and the salon
   * still can — which is what makes a sick stylist or an unreachable client resolvable.
   */
  it('succeeds on a booking the client could no longer cancel', async () => {
    const cancelled: string[] = []
    const asked: URLSearchParams[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          pagedBookings([
            cancelled.length === 0
              ? imminent()
              : booking({ id: 41, status: 'Cancelled', clientName: 'Mina Marić' }),
          ]),
        )
      }),
      api.cancelBooking(({ params }) => {
        cancelled.push(String(params.id))
        return HttpResponse.json(booking({ id: 41, status: 'Cancelled' }))
      }),
    )

    signedInAs('Admin')

    // Frozen cache: with the default every query refetches on mount anyway, so the table
    // asking again would prove nothing. The only thing that can make it re-ask here is having
    // been told its answer is stale.
    renderRoute('/admin/bookings', { staleTime: Infinity })

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: 'Cancel' }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, cancel it' }),
    )

    await waitFor(() => expect(cancelled).toEqual(['41']))

    // The question closes, and the row comes back with its new badge from a real refetch.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(asked).toHaveLength(2)
  })

  /**
   * Two admins on the same day. The API's own `detail` already says the booking has been
   * resolved, so the screen's contribution is the refetch — the row has to stop offering an
   * action nobody can take.
   */
  it('refetches when somebody else got there first', async () => {
    const asked: URLSearchParams[] = []
    let resolved = false

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          pagedBookings([
            resolved
              ? booking({ id: 41, status: 'Cancelled', clientName: 'Mina Marić' })
              : imminent(),
          ]),
        )
      }),
      api.cancelBooking(() => {
        resolved = true
        return HttpResponse.json(ALREADY_CANCELLED, { status: 409 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings', { staleTime: Infinity })

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: 'Cancel' }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, cancel it' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(ALREADY_CANCELLED.detail!)

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })
})

describe('marking a booking carried out', () => {
  const soon = () => {
    const start = addMinutes(nowWallClock(), 30)
    return booking({ id: 41, start, end: addMinutes(start, 60), clientName: 'Mina Marić' })
  }

  const underWay = () => {
    const start = addMinutes(nowWallClock(), -30)
    return booking({ id: 41, start, end: addMinutes(start, 60), clientName: 'Mina Marić' })
  }

  /**
   * The request this screen is built never to send. `BookingRules.CheckCompletion` refuses
   * `Now < start` with `booking_not_started`, and the explanation is the refusal's own words
   * reached through `copyForCode` rather than a second phrasing of the same rule.
   *
   * `aria-disabled` rather than `disabled`: a disabled button leaves the tab order, and the
   * sentence saying why would then be unreachable by the keyboard a receptionist is using.
   */
  it('is not available before the booking has started, and says why', async () => {
    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() => HttpResponse.json(pagedBookings([soon()]))),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings')

    const complete = await screen.findByRole('button', { name: 'Complete' })
    const why = copyForCode('booking_not_started').message

    expect(complete).toHaveAttribute('aria-disabled', 'true')
    expect(complete).toHaveAccessibleDescription(why)
    expect(complete).toHaveAttribute('title', why)
  })

  /**
   * Gated on the start and not the end, so a stylist who finished early can close the booking
   * out while the hour is still running.
   */
  it('is available once the booking has started, even before it ends', async () => {
    const completed: string[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(() =>
        HttpResponse.json(
          pagedBookings([
            completed.length === 0
              ? underWay()
              : booking({ id: 41, status: 'Completed', clientName: 'Mina Marić' }),
          ]),
        ),
      ),
      api.completeBooking(({ params }) => {
        completed.push(String(params.id))
        return HttpResponse.json(booking({ id: 41, status: 'Completed' }))
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings', { staleTime: Infinity })

    const typist = userEvent.setup()

    const complete = await screen.findByRole('button', { name: 'Complete' })
    expect(complete).not.toHaveAttribute('aria-disabled')

    await typist.click(complete)

    await waitFor(() => expect(completed).toEqual(['41']))
    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })

  /** The ticket's last line: a second completion says somebody already did this, and refetches. */
  it('says so and refetches when it has already been completed', async () => {
    const asked: URLSearchParams[] = []
    let resolved = false

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.bookings(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          pagedBookings([
            resolved
              ? booking({ id: 41, status: 'Completed', clientName: 'Mina Marić' })
              : underWay(),
          ]),
        )
      }),
      api.completeBooking(() => {
        resolved = true
        return HttpResponse.json(ALREADY_COMPLETED, { status: 409 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/bookings', { staleTime: Infinity })

    const typist = userEvent.setup()

    await typist.click(await screen.findByRole('button', { name: 'Complete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(ALREADY_COMPLETED.detail!)

    await waitFor(() => expect(asked).toHaveLength(2))
    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })
})
