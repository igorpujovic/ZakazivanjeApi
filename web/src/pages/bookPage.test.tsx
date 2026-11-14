import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  api,
  availableSlots,
  booking,
  CONTENDED,
  HttpResponse,
  problem,
  server,
  service,
  SERVICE_WITHDRAWN,
  SLOT_TAKEN,
  stylist,
  STYLIST_RETIRED,
  serveMockApi,
  UNFORESEEN,
} from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'

/**
 * The booking page, which is where ADR-0005's concurrency work becomes something a person can
 * see happen to them.
 *
 * Everything here is driven through the screen against a mocked API, because the claims are
 * about what a client ends up looking at: that "No preference" really asks every stylist, that
 * losing a race leaves them one tap from an alternative instead of on an error page, and that
 * a day with nothing free reads as an answer rather than a fault.
 *
 * `serveMockApi` makes an unanswered request fail the test, which is what keeps the fan-out
 * honest: a grid claiming to cover two stylists has to have asked about two stylists.
 */

serveMockApi()

const DAY = '2026-11-20'

const CUT = service({ id: 3, name: 'Women’s cut', durationMinutes: 60, price: 2500 })
const COLOUR = service({ id: 5, name: 'Colour', durationMinutes: 120, price: 6000 })

const ANA = stylist({ id: 1, name: 'Ana' })
const BOJAN = stylist({ id: 2, name: 'Bojan' })

/** The catalogue both controls are filled from. Every test needs it. */
const catalogue = (services = [CUT, COLOUR], stylists = [ANA, BOJAN]) => [
  api.services(() => HttpResponse.json(services)),
  api.stylists(() => HttpResponse.json(stylists)),
]

const grid = () => screen.getByRole('group', { name: 'Available start times' })

/**
 * Every start on offer, as it reads on screen: a slot button renders two lines — the time
 * range, and who is free then — and this puts them back together in the order the grid shows.
 */
const offers = () =>
  within(grid())
    .getAllByRole('button')
    .map((button) => [...button.children].map((line) => line.textContent).join(' '))

/** Pick a start from the grid and press Confirm. The two taps a booking really takes. */
const confirm = async (start: string) => {
  const typist = userEvent.setup()

  await typist.click(within(grid()).getByRole('button', { name: new RegExp('^' + start) }))
  await typist.click(screen.getByRole('button', { name: /^confirm/i }))

  return typist
}

describe('no preference', () => {
  it('asks every active stylist and merges one grid, each start labelled and shown once', async () => {
    const asked: string[] = []

    server.use(
      ...catalogue(),
      api.availableSlots(({ params, request }) => {
        const query = new URL(request.url).searchParams
        asked.push(`${params.id}:${query.get('Date')}:${query.get('ServiceId')}`)

        return HttpResponse.json(
          params.id === '1'
            ? availableSlots(DAY, 60, '09:00', '11:00')
            : availableSlots(DAY, 60, '09:00', '10:00'),
        )
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&date=${DAY}`)

    expect(await screen.findByRole('group', { name: 'Available start times' })).toBeInTheDocument()

    // One call per active stylist, both for the chosen day and service.
    expect(asked.sort()).toEqual([`1:${DAY}:3`, `2:${DAY}:3`])

    // 09:00 is offered by both and appears once, attributed to the stylist the catalogue
    // listed first. The rest interleave into one ascending grid.
    expect(offers()).toEqual(['09:00–10:00 Ana', '10:00–11:00 Bojan', '11:00–12:00 Ana'])
  })

  it('collapses to a single call once a stylist is named', async () => {
    const asked: string[] = []

    server.use(
      ...catalogue(),
      api.availableSlots(({ params }) => {
        asked.push(String(params.id))
        return HttpResponse.json(availableSlots(DAY, 60, '14:00'))
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=2&date=${DAY}`)

    await waitFor(() => expect(asked).toEqual(['2']))

    // One stylist was asked for by name, so naming them on every button would be noise.
    expect(offers()).toEqual(['14:00–15:00'])
  })
})

describe('the address bar as the page’s state', () => {
  it('renders a pasted link as the state it describes', async () => {
    server.use(
      ...catalogue(),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 120, '09:00'))),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=5&stylistId=1&date=${DAY}`)

    expect(await screen.findByRole('group', { name: 'Available start times' })).toBeInTheDocument()

    expect(screen.getByLabelText('Service')).toHaveValue('5')
    expect(screen.getByLabelText('Stylist')).toHaveValue('1')
    expect(screen.getByLabelText('Day')).toHaveValue(DAY)

    // The service's duration decides how long each offer runs, so the pasted service is
    // genuinely in force and not just selected in a dropdown.
    expect(offers()).toEqual(['09:00–11:00'])
  })

  it('re-queries in place when the service changes, without leaving the page', async () => {
    server.use(
      ...catalogue(),
      api.availableSlots(({ request }) => {
        const serviceId = new URL(request.url).searchParams.get('ServiceId')
        return serviceId === '3'
          ? HttpResponse.json(availableSlots(DAY, 60, '09:00'))
          : HttpResponse.json(availableSlots(DAY, 120, '16:00'))
      }),
    )

    signedInAs('Client')
    const { currentPath } = renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00']))

    await userEvent.setup().selectOptions(screen.getByLabelText('Service'), '5')

    await waitFor(() => expect(offers()).toEqual(['16:00–18:00']))

    // Same page, new address: the choice is linkable and the back button is free.
    expect(currentPath()).toBe(`/book?serviceId=5&stylistId=1&date=${DAY}`)
  })
})

describe('confirming', () => {
  it('posts the pick and sends the client to their bookings', async () => {
    const posted: unknown[] = []

    server.use(
      ...catalogue(),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 60, '09:00', '10:00'))),
      api.createBooking(async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(booking(), { status: 201 })
      }),
    )

    signedInAs('Client')
    const { currentPath } = renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00', '10:00–11:00']))
    await confirm('09:00')

    // Wall-clock, with no `Z` and no offset: the string the API sent us, sent back unchanged.
    await waitFor(() =>
      expect(posted).toEqual([{ stylistId: 1, serviceId: 3, start: `${DAY}T09:00:00` }]),
    )

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('posts the stylist the merged grid attributed the start to', async () => {
    const posted: unknown[] = []

    server.use(
      ...catalogue(),
      api.availableSlots(({ params }) =>
        HttpResponse.json(
          params.id === '1' ? availableSlots(DAY, 60, '11:00') : availableSlots(DAY, 60, '09:00'),
        ),
      ),
      api.createBooking(async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(booking(), { status: 201 })
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00 Bojan', '11:00–12:00 Ana']))
    await confirm('09:00')

    // No preference does not mean no stylist: 09:00 was Bojan's, so Bojan is who is booked.
    await waitFor(() =>
      expect(posted).toEqual([{ stylistId: 2, serviceId: 3, start: `${DAY}T09:00:00` }]),
    )
  })
})

describe('losing the race', () => {
  it('says the time went, drops it from the grid, and keeps every other choice', async () => {
    let taken = false

    server.use(
      ...catalogue(),
      api.availableSlots(() =>
        HttpResponse.json(
          taken
            ? availableSlots(DAY, 60, '10:00', '11:00')
            : availableSlots(DAY, 60, '09:00', '10:00', '11:00'),
        ),
      ),
      api.createBooking(() => {
        // Someone else got there between the offer and the confirmation. Exactly what a slot
        // being an offer rather than a hold means, and not an error in anything.
        taken = true
        return HttpResponse.json(SLOT_TAKEN, { status: 409 })
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00', '10:00–11:00', '11:00–12:00']))
    await confirm('09:00')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That time was just taken by someone else. Here is what is still free.',
    )

    // The grid refetched and 09:00 is gone from it.
    await waitFor(() => expect(offers()).toEqual(['10:00–11:00', '11:00–12:00']))

    // Service, stylist and day all still chosen: an alternative is one tap away.
    expect(screen.getByLabelText('Service')).toHaveValue('3')
    expect(screen.getByLabelText('Stylist')).toHaveValue('1')
    expect(screen.getByLabelText('Day')).toHaveValue(DAY)
  })

  it('offers a retry when the schedule was merely contended, and the retry takes', async () => {
    const posted: unknown[] = []

    server.use(
      ...catalogue(),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 60, '09:00'))),
      api.createBooking(async ({ request }) => {
        posted.push(await request.json())

        // Nothing was written, and the API's own `detail` asks for another go (ADR-0005).
        return posted.length === 1
          ? HttpResponse.json(CONTENDED, { status: 409 })
          : HttpResponse.json(booking(), { status: 201 })
      }),
    )

    signedInAs('Client')
    const { currentPath } = renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00']))
    const typist = await confirm('09:00')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The schedule is busy being changed right now. Try that again.',
    )

    // Nothing to re-enter: the same pick is still held, and one press sends it again.
    await typist.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
    expect(posted).toEqual([
      { stylistId: 1, serviceId: 3, start: `${DAY}T09:00:00` },
      { stylistId: 1, serviceId: 3, start: `${DAY}T09:00:00` },
    ])
  })

  it('refetches rather than retries when the start has slipped into the past', async () => {
    let asked = 0

    server.use(
      ...catalogue(),
      api.availableSlots(() => {
        asked += 1
        return HttpResponse.json(availableSlots(DAY, 60, '09:00'))
      }),
      api.createBooking(() =>
        HttpResponse.json(problem(409, 'start_in_past', 'A booking cannot start in the past.'), {
          status: 409,
        }),
      ),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00']))
    await confirm('09:00')

    expect(await screen.findByRole('alert')).toHaveTextContent('That time has already passed.')

    // Refetched, not retried: a start that has passed cannot be booked by asking twice.
    await waitFor(() => expect(asked).toBe(2))
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('says what is no longer on offer when a stylist is retired mid-flow', async () => {
    let retired = false

    server.use(
      api.services(() => HttpResponse.json([CUT, COLOUR])),
      api.stylists(() => HttpResponse.json(retired ? [BOJAN] : [ANA, BOJAN])),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 60, '09:00'))),
      api.createBooking(() => {
        retired = true
        return HttpResponse.json(STYLIST_RETIRED, { status: 409 })
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00']))
    await confirm('09:00')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That stylist is no longer taking appointments. Choose another.',
    )

    // The catalogue was refetched, so the retired stylist is not offered any more either.
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Stylist')).queryByRole('option', { name: 'Ana' }),
      ).not.toBeInTheDocument(),
    )

    /*
     * And the page is not left dead. A stylist who has been retired falls back to No
     * preference, so the grid fills with whoever is left and an alternative really is one tap
     * away — which is what the ticket asks of this recovery. The control says No preference
     * because that is genuinely what is being asked, not because the option vanished.
     */
    expect(screen.getByLabelText('Stylist')).toHaveValue('')
    await waitFor(() => expect(offers()).toEqual(['09:00–10:00 Bojan']))
    expect(screen.getByLabelText('Service')).toHaveValue('3')
    expect(screen.getByLabelText('Day')).toHaveValue(DAY)
  })

  it('says what is no longer on offer when a service is withdrawn mid-flow', async () => {
    let withdrawn = false

    server.use(
      api.services(() => HttpResponse.json(withdrawn ? [COLOUR] : [CUT, COLOUR])),
      api.stylists(() => HttpResponse.json([ANA])),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 60, '09:00'))),
      api.createBooking(() => {
        withdrawn = true
        return HttpResponse.json(SERVICE_WITHDRAWN, { status: 409 })
      }),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00']))
    await confirm('09:00')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That service is no longer on the menu. Choose another.',
    )

    /*
     * No fallback here, and deliberately none: a service's duration is what the whole grid is
     * computed from, so there is no "whoever is free" to drop back to. The control returns to
     * its placeholder and the grid waits.
     */
    await waitFor(() => expect(screen.getByLabelText('Service')).toHaveValue(''))
    expect(
      within(screen.getByLabelText('Service')).queryByRole('option', { name: /Women’s cut/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Available start times' })).not.toBeInTheDocument()
  })
})

describe('when only some of the fan-out answers', () => {
  it('shows what did answer and admits the rest was not checked', async () => {
    server.use(
      ...catalogue(),
      api.availableSlots(({ params }) =>
        params.id === '1'
          ? HttpResponse.json(availableSlots(DAY, 60, '09:00'))
          : HttpResponse.json(UNFORESEEN, { status: 500 }),
      ),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&date=${DAY}`)

    // Ana answered, so Ana's times are shown. Refusing to show them because Bojan's request
    // fell over would be worse, and merging Bojan in as "nothing free" would be a lie.
    await waitFor(() => expect(offers()).toEqual(['09:00–10:00 Ana']))

    expect(
      screen.getByText(/Some stylists could not be checked just now/),
    ).toBeInTheDocument()
  })
})

describe('a day with nothing on it', () => {
  it('is an answer, not a failure', async () => {
    server.use(
      ...catalogue(),
      // A Sunday: the salon has no working hours that weekday, so there is nothing to offer
      // and nothing to complain about.
      api.availableSlots(() => HttpResponse.json(availableSlots('2026-11-22', 60))),
    )

    signedInAs('Client')
    renderRoute('/book?serviceId=3&stylistId=1&date=2026-11-22')

    expect(
      await screen.findByRole('heading', { name: /nothing free that day/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the grid by keyboard alone', () => {
  it('walks the starts with the arrow keys and picks one with Enter', async () => {
    server.use(
      ...catalogue(),
      api.availableSlots(() => HttpResponse.json(availableSlots(DAY, 60, '09:00', '10:00'))),
      api.createBooking(() => HttpResponse.json(booking(), { status: 201 })),
    )

    signedInAs('Client')
    renderRoute(`/book?serviceId=3&stylistId=1&date=${DAY}`)

    await waitFor(() => expect(offers()).toEqual(['09:00–10:00', '10:00–11:00']))

    const typist = userEvent.setup()
    const [first, second] = within(grid()).getAllByRole('button')

    first.focus()
    await typist.keyboard('{ArrowRight}')
    expect(second).toHaveFocus()

    await typist.keyboard('{Enter}')

    // Picked, and the confirmation names the start that was walked to rather than the first.
    expect(second).toHaveAttribute('aria-pressed', 'true')

    const pick = within(screen.getByRole('region', { name: 'Your pick' }))
    expect(pick.getByText(/10:00–11:00/)).toBeInTheDocument()
    expect(pick.getByRole('button', { name: /^confirm/i })).toBeInTheDocument()
  })
})
