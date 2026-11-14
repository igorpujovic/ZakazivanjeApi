import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { api, HttpResponse, server, service, serveMockApi } from '../test/apiMocks'
import { renderRoute } from '../test/renderRoute'

/**
 * The menu is the landing page — the first thing anyone sees, reviewer included — so what it
 * owes a visitor is small and worth holding to: what the salon does, what each thing costs,
 * how long it takes, and a way into booking it that carries the choice along.
 *
 * `GET /api/services` without `includeInactive` is already the menu rather than the
 * catalogue: the API answers a client with active services only, so there is nothing to
 * filter here and this screen deliberately does not try.
 */

serveMockApi()

describe('the menu', () => {
  it('says what the salon does, what it costs and how long it takes', async () => {
    server.use(
      api.services(() =>
        HttpResponse.json([
          service({ id: 3, name: 'Women’s cut', durationMinutes: 60, price: 2500 }),
          service({ id: 8, name: 'Beard trim', durationMinutes: 30, price: 900 }),
        ]),
      ),
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
    )

    renderRoute('/')

    const offer = await screen.findByRole('link', { name: /Beard trim/ })
    expect(offer).toHaveAttribute('href', '/book?serviceId=8')
  })

  it('says plainly that there is nothing on the menu, rather than looking broken', async () => {
    server.use(api.services(() => HttpResponse.json([])))

    renderRoute('/')

    expect(await screen.findByRole('heading', { name: /nothing on the menu/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
