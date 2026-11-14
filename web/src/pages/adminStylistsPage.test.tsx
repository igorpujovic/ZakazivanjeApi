import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  api,
  booking,
  HttpResponse,
  pagedBookings,
  server,
  serveMockApi,
  stylist,
} from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'
import { asWallClock, todayWallClockDate } from '../lib/wallClock'

/**
 * `/admin/stylists`: the other half of the catalogue.
 *
 * The same screen as the services one, over a row that is only a name — `StylistResponse` is
 * `{ id, name, isActive }`, and a stylist has no account and never signs in. What differs is
 * the API underneath and the words on top, and both differences are what this file is about.
 *
 * There is **no `DELETE`** for a stylist: every booking ever taken points at one, so retiring
 * is `PUT` with `isActive: false` — the same route that renames one. And a stylist is not on
 * the menu, the menu being services, so the question asked before withdrawing one has to be
 * about new bookings instead.
 */

serveMockApi()

const ANA = stylist({ id: 1, name: 'Ana' })
const BOJAN = stylist({ id: 2, name: 'Bojan', isActive: false })

describe('the list', () => {
  it('opens on who can be booked, and widens when inactive ones are asked for', async () => {
    const asked: URLSearchParams[] = []

    server.use(
      api.stylists(({ request }) => {
        asked.push(new URL(request.url).searchParams)
        return HttpResponse.json(asked.length === 1 ? [ANA] : [ANA, BOJAN])
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/stylists')

    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(asked[0].has('includeInactive')).toBe(false)

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /show inactive/i }))

    expect(await screen.findByText('Bojan')).toBeInTheDocument()
    expect(asked[1].get('includeInactive')).toBe('true')

    const withdrawn = screen.getByText('Bojan').closest('tr')
    expect(within(withdrawn!).getByText('Inactive')).toBeInTheDocument()
  })

  it('says so when the salon has no stylists yet', async () => {
    server.use(api.stylists(() => HttpResponse.json([])))

    signedInAs('Admin')
    renderRoute('/admin/stylists')

    expect(await screen.findByRole('heading', { name: /no stylists yet/i })).toBeInTheDocument()
  })
})

describe('withdrawing a stylist', () => {
  /**
   * The same question as a service's, in the half of the glossary's **Active** entry that
   * applies: a stylist may not be *chosen for a new booking*, which is not the same sentence as
   * coming off the menu — the menu is services.
   */
  it('asks in words about new bookings rather than about the menu', async () => {
    const bodies: unknown[] = []

    server.use(
      api.stylists(() => HttpResponse.json([ANA])),
      api.updateStylist(async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...ANA, isActive: false })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/stylists')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('switch', { name: /Ana/ }))

    const question = await screen.findByRole('dialog')
    const said = question.textContent ?? ''

    expect(said).toContain('Ana')
    expect(said).toMatch(/new booking/i)
    expect(said).toMatch(/bookings already made/i)
    expect(said).not.toMatch(/menu/i)
    expect(said).not.toMatch(/delet/i)

    await typist.click(within(question).getByRole('button', { name: /withdraw them/i }))

    // `PUT`, carrying the name, because there is no route that would take the flag alone.
    await waitFor(() => expect(bodies).toEqual([{ name: 'Ana', isActive: false }]))
  })
})

/**
 * The ticket's last line, which is a claim about two screens: a stylist with bookings can be
 * withdrawn, and those bookings still name them.
 *
 * It is the reason there is no `DELETE` here at all — a row that could be removed would take
 * that history with it (ADR-0004) — and the frontend's share of it is that the bookings table
 * renders the booking's own `stylistName`.
 */
describe('a stylist with bookings', () => {
  const TODAY = todayWallClockDate()

  it('can be withdrawn, and their bookings still name them', async () => {
    let available = true

    server.use(
      api.stylists(({ request }) => {
        const all = [{ ...ANA, isActive: available }]
        const includeInactive =
          new URL(request.url).searchParams.get('includeInactive') === 'true'

        return HttpResponse.json(includeInactive ? all : all.filter((row) => row.isActive))
      }),

      api.updateStylist(async ({ request }) => {
        const body = (await request.json()) as { isActive: boolean }
        available = body.isActive
        return HttpResponse.json({ ...ANA, isActive: available })
      }),

      api.bookings(() =>
        HttpResponse.json(
          pagedBookings([
            booking({
              id: 41,
              start: asWallClock(`${TODAY}T09:00:00`),
              end: asWallClock(`${TODAY}T10:00:00`),
              stylistId: 1,
              stylistName: 'Ana',
            }),
          ]),
        ),
      ),
    )

    signedInAs('Admin')
    renderRoute('/admin/stylists?includeInactive=true', { staleTime: Infinity })

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('switch', { name: /Ana/ }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /withdraw them/i }),
    )

    // Still on the books, and now saying what they are.
    expect(await screen.findByText('Inactive')).toBeInTheDocument()

    await typist.click(screen.getByRole('link', { name: /all bookings/i }))

    expect(await screen.findByText('Mina Marić')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })
})

describe('the side panel', () => {
  /**
   * No request on the way in. There is no route that reads one stylist back, and none is
   * needed: the row already holds everything the panel edits.
   */
  it('opens on the row, because the API offers no way to ask about one stylist', async () => {
    const bodies: unknown[] = []

    server.use(
      api.stylists(() => HttpResponse.json([BOJAN])),
      api.updateStylist(async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(BOJAN)
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/stylists?includeInactive=true')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /edit bojan/i }))

    const name = await screen.findByLabelText(/name/i)
    expect(name).toHaveValue('Bojan')

    await typist.clear(name)
    await typist.type(name, 'Bojan Ilić')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    // Renaming a withdrawn stylist must not quietly put them back, which is why `isActive` is
    // required on the request rather than defaulted.
    await waitFor(() => expect(bodies).toEqual([{ name: 'Bojan Ilić', isActive: false }]))
  })

  /** `CreateStylistRequest` is a name and nothing else: there is nothing to authenticate. */
  it('adds a stylist by name alone', async () => {
    const bodies: unknown[] = []

    server.use(
      api.stylists(() => HttpResponse.json([])),
      api.createStylist(async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(stylist({ id: 5, name: 'Dragana' }), { status: 201 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/stylists')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /add a stylist/i }))

    await typist.type(await screen.findByLabelText(/name/i), 'Dragana')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(bodies).toEqual([{ name: 'Dragana' }]))
  })
})
