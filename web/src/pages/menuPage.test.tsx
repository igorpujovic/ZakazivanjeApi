import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { api, HttpResponse, server, service, serveMockApi, stylist } from '../test/apiMocks'
import { renderRoute } from '../test/renderRoute'

/**
 * The menu is the landing page — the first thing anyone sees, reviewer included — so what it
 * owes a visitor is small and worth holding to: what the salon does, what each thing costs,
 * how long it takes, and a way into booking it that carries the choice along.
 *
 * `GET /api/services` without `includeInactive` is already the menu rather than the
 * catalogue: the API answers a client with active services only, so there is nothing to
 * filter here and this screen deliberately does not try.
 *
 * It asks for the stylists too, for the chairs — the same anonymous list the booking page
 * uses. Every test here therefore answers both endpoints, because an unanswered request fails
 * the suite (`test/apiMocks.ts`) and because a screen that asks for two things should be
 * tested against two answers.
 */

serveMockApi()

/** The chairs, when a test is not about them. */
const someStylists = () =>
  api.stylists(() =>
    HttpResponse.json([stylist({ id: 1, name: 'Ana' }), stylist({ id: 2, name: 'Marko' })]),
  )

describe('the menu', () => {
  it('says what the salon does, what it costs and how long it takes', async () => {
    server.use(
      api.services(() =>
        HttpResponse.json([
          service({ id: 3, name: 'Women’s cut', durationMinutes: 60, price: 2500 }),
          service({ id: 8, name: 'Beard trim', durationMinutes: 30, price: 900 }),
        ]),
      ),
      someStylists(),
    )

    renderRoute('/')

    // `sr-RS` formatting, English copy: the salon's market reads prices this way, and the
    // numbers are the ones `wallClock.formatMoney` and `formatDuration` produce.
    expect(await screen.findByText('Women’s cut')).toBeInTheDocument()
    expect(screen.getByText('2.500 RSD')).toBeInTheDocument()
    expect(screen.getByText('1 h')).toBeInTheDocument()

    expect(screen.getByText('Beard trim')).toBeInTheDocument()
    expect(screen.getByText('900 RSD')).toBeInTheDocument()
    expect(screen.getByText('30 min')).toBeInTheDocument()
  })

  it('offers each service as the beginning of a booking, with the service already chosen', async () => {
    server.use(
      api.services(() => HttpResponse.json([service({ id: 8, name: 'Beard trim' })])),
      someStylists(),
    )

    renderRoute('/')

    const offer = await screen.findByRole('link', { name: /Beard trim/ })
    expect(offer).toHaveAttribute('href', '/book?serviceId=8')
  })

  it('says plainly that there is nothing on the menu, rather than looking broken', async () => {
    server.use(api.services(() => HttpResponse.json([])), someStylists())

    renderRoute('/')

    expect(await screen.findByRole('heading', { name: /nothing on the menu/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * The shopfront: the things a visitor looks for on a barbershop's page that are not a service.
 *
 * The hours and the address come from `brand/house.ts` and are the same on every page, so
 * what is worth asserting here is that the screen is wired to them at all — and, for the
 * chairs, that an introduction never becomes a dependency: the menu has to survive the
 * stylists being unavailable, because the choice of stylist lives on `/book`.
 */
describe('the shopfront', () => {
  it('introduces the chairs, each one a way into booking with that stylist', async () => {
    server.use(
      api.services(() => HttpResponse.json([service()])),
      api.stylists(() =>
        HttpResponse.json([stylist({ id: 1, name: 'Ana' }), stylist({ id: 4, name: 'Marko' })]),
      ),
    )

    renderRoute('/')

    expect(await screen.findByRole('heading', { name: 'The chairs' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/book?stylistId=1')
    expect(screen.getByRole('link', { name: /Marko/ })).toHaveAttribute(
      'href',
      '/book?stylistId=4',
    )
  })

  it('leaves the chairs out rather than showing an empty row when nobody can be fetched', async () => {
    server.use(
      api.services(() => HttpResponse.json([service({ name: 'Beard trim' })])),
      api.stylists(() => HttpResponse.json([])),
    )

    renderRoute('/')

    expect(await screen.findByText('Beard trim')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The chairs' })).not.toBeInTheDocument()
  })

  it('tells a visitor when the shop is open and where to find it', async () => {
    server.use(api.services(() => HttpResponse.json([service()])), someStylists())

    renderRoute('/')

    // The mirror of `WorkingHours:Days`, printed: Saturday is the line that differs, and
    // Sunday is listed as closed rather than left out.
    expect(await screen.findByRole('heading', { name: 'The shop' })).toBeInTheDocument()
    expect(screen.getAllByText('09:00–14:00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Closed').length).toBeGreaterThan(0)

    // The number, as a link a phone can act on.
    expect(screen.getAllByRole('link', { name: /011 2345 678/ })[0]).toHaveAttribute(
      'href',
      'tel:+381112345678',
    )
  })
})
