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
  service,
  stylist,
  validationProblem,
} from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'
import { asWallClock, todayWallClockDate } from '../lib/wallClock'

/**
 * `/admin/services`, and the panel a service is created and edited in.
 *
 * A side panel rather than an address of its own, which is what keeps the application's eight
 * routes at eight and keeps the list visible behind the form while it is being filled in.
 *
 * Split from `adminServicesPage.test.tsx` because it is about a different thing: that file is
 * the catalogue and what withdrawing from it means, this one is the form — what it opens on,
 * what it sends, what it refuses and how it behaves for someone using a keyboard.
 */

serveMockApi()

const WOMENS_CUT = service({ id: 3, name: 'Women’s cut', durationMinutes: 60, price: 2500 })

const COLOURING = service({
  id: 4,
  name: 'Colouring',
  durationMinutes: 120,
  price: 6400,
  isActive: false,
})

describe('what the panel opens on', () => {
  /**
   * Through `GET /api/services/{id}` rather than off the row it was clicked from. That route
   * is the only one in the API that answers with a withdrawn service by id, and the request
   * matters because `PUT` is a full replacement: a form filled from a row fetched minutes ago
   * would quietly post that copy back over whatever has happened since.
   *
   * The answer here deliberately disagrees with the row, which is the only way to tell which
   * of the two the form was filled from.
   */
  it('opens on the service as the API has it now, not on the row it was clicked from', async () => {
    const asked: string[] = []

    server.use(
      api.services(() => HttpResponse.json([WOMENS_CUT])),
      api.service(({ params }) => {
        asked.push(String(params.id))
        return HttpResponse.json({ ...WOMENS_CUT, name: 'Women’s cut and finish', price: 2900 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    await userEvent.setup().click(await screen.findByRole('button', { name: /edit women’s cut/i }))

    const panel = await screen.findByRole('dialog')
    expect(asked).toEqual(['3'])

    expect(await within(panel).findByLabelText(/name/i)).toHaveValue('Women’s cut and finish')
    expect(within(panel).getByLabelText(/price/i)).toHaveValue(2900)
    expect(within(panel).getByLabelText(/duration/i)).toHaveValue(60)
  })

  /** ADR-0003, said to the only person who would ever worry about it. */
  it('says that changes do not affect bookings already made', async () => {
    server.use(
      api.services(() => HttpResponse.json([WOMENS_CUT])),
      api.service(() => HttpResponse.json(WOMENS_CUT)),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    await userEvent.setup().click(await screen.findByRole('button', { name: /edit women’s cut/i }))

    const panel = await screen.findByRole('dialog')
    expect(panel.textContent).toMatch(/bookings already made/i)
  })
})

describe('what the panel sends', () => {
  /**
   * A full replacement carrying the flag the row already had. `UpdateServiceRequest` requires
   * `IsActive` rather than defaulting it precisely so this cannot go wrong: correcting a typo
   * in a withdrawn service's name must not put it back on the menu.
   */
  it('saves every field, keeping the activation the row already had', async () => {
    const bodies: unknown[] = []

    server.use(
      api.services(() => HttpResponse.json([COLOURING])),
      api.service(() => HttpResponse.json(COLOURING)),
      api.updateService(async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(COLOURING)
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services?includeInactive=true')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /edit colouring/i }))

    const name = await screen.findByLabelText(/name/i)
    await typist.clear(name)
    await typist.type(name, 'Colour and cut')

    await typist.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(bodies).toEqual([
        { name: 'Colour and cut', durationMinutes: 120, price: 6400, isActive: false },
      ]),
    )

    // The question answered, the panel goes.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /** `CreateServiceRequest` has no `IsActive` at all: a new service is always on the menu. */
  it('creates a service without sending an activation', async () => {
    const bodies: Record<string, unknown>[] = []

    server.use(
      api.services(() => HttpResponse.json([])),
      api.createService(async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(service({ id: 9, name: 'Beard trim' }), { status: 201 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /add a service/i }))

    await typist.type(await screen.findByLabelText(/name/i), 'Beard trim')
    await typist.type(screen.getByLabelText(/duration/i), '30')
    await typist.type(screen.getByLabelText(/price/i), '1200')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ name: 'Beard trim', durationMinutes: 30, price: 1200 })
    expect('isActive' in bodies[0]).toBe(false)
  })
})

describe('what the panel refuses', () => {
  /**
   * The browser's own refusal, from `limits.ts` mirroring `CatalogueLimits.cs`. A
   * 250-character name cannot be typed into the box, so no request carrying one is ever made
   * — which is the whole reason for mirroring the bounds rather than waiting for the `400`.
   */
  it('will not let a 250-character name be typed, let alone sent', async () => {
    const bodies: { name: string }[] = []

    server.use(
      api.services(() => HttpResponse.json([])),
      api.createService(async ({ request }) => {
        bodies.push((await request.json()) as { name: string })
        return HttpResponse.json(service({ id: 9 }), { status: 201 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /add a service/i }))

    const name = await screen.findByLabelText(/name/i)
    await typist.type(name, 'x'.repeat(250))

    expect((name as HTMLInputElement).value).toHaveLength(200)

    await typist.type(screen.getByLabelText(/duration/i), '30')
    await typist.type(screen.getByLabelText(/price/i), '1200')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].name).toHaveLength(200)
  })

  /**
   * And the backstop, for the rule the browser cannot know: the API trims a name as it binds
   * it, so one made of spaces trims away to nothing and is refused — with the complaint
   * landing on the box it is about rather than in a banner above a form that looks fine.
   */
  it('lands the server’s complaint about a name of spaces on the name field', async () => {
    server.use(
      api.services(() => HttpResponse.json([])),
      api.createService(() =>
        HttpResponse.json(validationProblem({ Name: ['The Name field is required.'] }), {
          status: 400,
        }),
      ),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /add a service/i }))

    const name = await screen.findByLabelText(/name/i)
    await typist.type(name, '   ')
    await typist.type(screen.getByLabelText(/duration/i), '30')
    await typist.type(screen.getByLabelText(/price/i), '1200')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('The Name field is required.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(/required/i)

    // Refused, so the panel stays up with what was typed still in it.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(name).toHaveValue('   ')
  })
})

/**
 * The three things a hand-rolled panel gets wrong, which is why this one is Radix's Dialog:
 * focus goes in, stays in, and comes back to where it was.
 */
describe('the panel and a keyboard', () => {
  it('traps focus, closes on Escape, and gives focus back to the row that opened it', async () => {
    server.use(
      api.services(() => HttpResponse.json([WOMENS_CUT])),
      api.service(() => HttpResponse.json(WOMENS_CUT)),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    const typist = userEvent.setup()
    const edit = await screen.findByRole('button', { name: /edit women’s cut/i })
    await typist.click(edit)

    const panel = await screen.findByRole('dialog')
    await within(panel).findByLabelText(/name/i)

    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))

    // All the way round the panel's controls and past the end of them.
    for (let i = 0; i < 8; i++) await typist.tab()
    expect(panel.contains(document.activeElement)).toBe(true)

    await typist.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Radix hands focus back a tick after the panel goes, so this is waited for rather than
    // read straight away.
    await waitFor(() => expect(document.activeElement).toBe(edit))
  })
})

/**
 * The ticket's fourth "done when" line, which is a claim about two screens: editing a price
 * must not change the price on a booking made before the edit.
 *
 * ADR-0003 is why — a booking records what was agreed when it was made — and the frontend's
 * share of it is that the bookings table renders the booking's own snapshot and never goes
 * looking the service up. So the journey edits the price to 3.000 and then goes and reads the
 * booking, which still says 2.500.
 */
describe('a booking made before the edit', () => {
  const TODAY = todayWallClockDate()

  it('keeps the price it was taken at', async () => {
    let price = 2500

    server.use(
      api.services(() => HttpResponse.json([{ ...WOMENS_CUT, price }])),
      api.service(() => HttpResponse.json({ ...WOMENS_CUT, price })),
      api.updateService(async ({ request }) => {
        const body = (await request.json()) as { price: number }
        price = body.price
        return HttpResponse.json({ ...WOMENS_CUT, price })
      }),

      api.stylists(() => HttpResponse.json([stylist({ id: 1, name: 'Ana' })])),

      /*
       * The booking, as the API really answers it: its own `serviceName` and `price`, written
       * when it was made. Nothing here consults the catalogue, which is the point.
       */
      api.bookings(() =>
        HttpResponse.json(
          pagedBookings([
            booking({
              id: 41,
              start: asWallClock(`${TODAY}T09:00:00`),
              end: asWallClock(`${TODAY}T10:00:00`),
              serviceName: 'Women’s cut',
              price: 2500,
            }),
          ]),
        ),
      ),
    )

    signedInAs('Admin')
    renderRoute('/admin/services', { staleTime: Infinity })

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('button', { name: /edit women’s cut/i }))

    const priceBox = await screen.findByLabelText(/price/i)
    await typist.clear(priceBox)
    await typist.type(priceBox, '3000')
    await typist.click(screen.getByRole('button', { name: /save/i }))

    // The catalogue now says 3.000.
    expect(await screen.findByText('3.000 RSD')).toBeInTheDocument()

    await typist.click(screen.getByRole('link', { name: /all bookings/i }))

    // The booking still says what it was agreed at.
    expect(await screen.findByText('Mina Marić')).toBeInTheDocument()
    expect(screen.getByText('2.500 RSD')).toBeInTheDocument()
    expect(screen.queryByText('3.000 RSD')).not.toBeInTheDocument()
  })
})
