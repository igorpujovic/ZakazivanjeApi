import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { api, HttpResponse, server, serveMockApi, service } from '../test/apiMocks'
import { renderRoute, signedInAs } from '../test/renderRoute'

/**
 * `/admin/services`: the catalogue, which is not the menu.
 *
 * `GLOSSARY.md` governs this screen more than any other in the application, so most of what is
 * proved here is about words and consequences rather than about layout. The catalogue holds
 * what has been withdrawn just as it holds what is on offer; the menu is the active services a
 * client may choose from; and withdrawing something is reversible, which is why the question
 * asked about it says so.
 *
 * `serveMockApi` fails a test on any request nothing answered, which is what keeps every claim
 * about a refetch honest.
 */

serveMockApi()

const WOMENS_CUT = service({ id: 3, name: 'Women’s cut', durationMinutes: 60, price: 2500 })

/** Withdrawn: in the catalogue, off the menu. Only an admin asking for it ever sees it. */
const COLOURING = service({
  id: 4,
  name: 'Colouring',
  durationMinutes: 120,
  price: 6400,
  isActive: false,
})

/** Every query string the screen sent to the services list, in order. */
function recordServices(...answers: (typeof WOMENS_CUT)[][]) {
  const asked: URLSearchParams[] = []

  const handler = api.services(({ request }) => {
    asked.push(new URL(request.url).searchParams)
    return HttpResponse.json(answers[Math.min(asked.length - 1, answers.length - 1)])
  })

  return { asked, handler }
}

describe('the catalogue', () => {
  /**
   * The menu, until asked otherwise. `GET /api/services` answers an admin the same as anybody
   * else unless `includeInactive` is sent, and sending `false` would be an admin-only
   * parameter on a request that did not need one.
   */
  it('opens on what is on the menu, asking the endpoint nothing extra', async () => {
    const { asked, handler } = recordServices([WOMENS_CUT])
    server.use(handler)

    signedInAs('Admin')
    renderRoute('/admin/services')

    expect(await screen.findByText('Women’s cut')).toBeInTheDocument()
    expect(screen.getByText('1 h')).toBeInTheDocument()
    expect(screen.getByText('2.500 RSD')).toBeInTheDocument()

    expect(asked[0].has('includeInactive')).toBe(false)
  })

  /**
   * The whole point of issue 02 and ADR-0012: without this an admin can withdraw a service and
   * never see or recover it again, there being no other route that would show it to them.
   */
  it('widens to the whole catalogue when inactive ones are asked for', async () => {
    const { asked, handler } = recordServices([WOMENS_CUT], [WOMENS_CUT, COLOURING])
    server.use(handler)

    signedInAs('Admin')
    const { currentPath } = renderRoute('/admin/services')

    await screen.findByText('Women’s cut')
    expect(screen.queryByText('Colouring')).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /show inactive/i }))

    expect(await screen.findByText('Colouring')).toBeInTheDocument()
    expect(asked[1].get('includeInactive')).toBe('true')

    // And in the address, so the wider view survives a refresh and can be sent to somebody.
    expect(currentPath()).toBe('/admin/services?includeInactive=true')
  })

  /** A withdrawn row is still a row: dimmed, badged, and still something an admin can act on. */
  it('badges a withdrawn service rather than hiding what it is', async () => {
    server.use(api.services(() => HttpResponse.json([WOMENS_CUT, COLOURING])))

    signedInAs('Admin')
    renderRoute('/admin/services?includeInactive=true')

    const withdrawn = (await screen.findByText('Colouring')).closest('tr')
    expect(withdrawn).not.toBeNull()
    expect(within(withdrawn!).getByText('Inactive')).toBeInTheDocument()

    const onTheMenu = screen.getByText('Women’s cut').closest('tr')
    expect(within(onTheMenu!).queryByText('Inactive')).not.toBeInTheDocument()
  })

  /** A salon that has not filled its catalogue in yet. Nothing is wrong; there is just nothing. */
  it('says so when the salon has no services yet', async () => {
    server.use(api.services(() => HttpResponse.json([])))

    signedInAs('Admin')
    renderRoute('/admin/services')

    expect(await screen.findByRole('heading', { name: /no services yet/i })).toBeInTheDocument()
  })
})

describe('withdrawing, and putting back', () => {
  /**
   * The question, in the glossary's words. Three things have to be in it and one must not be:
   * what goes (the menu), what stays (the bookings already made), that it can be undone — and
   * never the word delete, though the route really is `DELETE /api/services/{id}`.
   */
  it('asks before taking a service off the menu, and sends nothing until it is answered', async () => {
    const withdrawn: string[] = []

    server.use(
      api.services(() => HttpResponse.json([WOMENS_CUT])),
      api.withdrawService(({ params }) => {
        withdrawn.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services')

    const typist = userEvent.setup()
    await typist.click(await screen.findByRole('switch', { name: /Women’s cut/ }))

    const question = await screen.findByRole('dialog')
    const said = question.textContent ?? ''

    expect(said).toContain('Women’s cut')
    expect(said).toMatch(/menu/i)
    expect(said).toMatch(/bookings already made/i)
    expect(said).toMatch(/at any time/i)

    // Asked, not done: an unanswered question has changed nothing.
    expect(withdrawn).toEqual([])

    await typist.click(within(question).getByRole('button', { name: /withdraw it/i }))

    await waitFor(() => expect(withdrawn).toEqual(['3']))
  })

  /** The word reaches no screen. Attributes included — a tooltip is a screen too. */
  it('never says delete, with the question open', async () => {
    server.use(api.services(() => HttpResponse.json([WOMENS_CUT])))

    signedInAs('Admin')
    renderRoute('/admin/services')

    await userEvent.setup().click(await screen.findByRole('switch', { name: /Women’s cut/ }))
    await screen.findByRole('dialog')

    expect(document.body.innerHTML).not.toMatch(/delet/i)
  })

  /**
   * Putting something back is harmless, so it is not guarded. A dialog in front of a harmless
   * action is how an admin learns to dismiss dialogs without reading them.
   *
   * It goes out as the `PUT` that carries every field, because that is the only route that
   * sets the flag true — `DELETE` is one-way on its own (ADR-0004).
   */
  it('puts one back without asking, carrying the whole service', async () => {
    const bodies: unknown[] = []

    server.use(
      api.services(() => HttpResponse.json([COLOURING])),
      api.updateService(async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...COLOURING, isActive: true })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services?includeInactive=true')

    await userEvent.setup().click(await screen.findByRole('switch', { name: /Colouring/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(bodies).toEqual([
        { name: 'Colouring', durationMinutes: 120, price: 6400, isActive: true },
      ]),
    )
  })
})

/**
 * The ticket's first two "done when" lines, which are claims about two screens rather than
 * one: a service withdrawn in the catalogue has to leave the **menu** a client sees, and come
 * back to it when it is put back.
 *
 * So the journey is the test — the real route tree, from the menu to the catalogue and back —
 * with `staleTime: Infinity`, which is what makes it bite. With the default, every query
 * refetches on mount and the menu would look right even with the invalidation deleted. Frozen,
 * the only thing that can bring the menu up to date is having been told it is out of date.
 */
describe('what a client sees', () => {
  /** The salon's catalogue, as a small stateful API: one service, and a flag an admin moves. */
  function salon() {
    let onTheMenu = true

    return [
      api.services(({ request }) => {
        const all = [{ ...WOMENS_CUT, isActive: onTheMenu }]
        const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true'

        // The endpoint's own rule, which is the whole of issue 02: a client is served the menu,
        // an admin asking for it is served the catalogue.
        return HttpResponse.json(includeInactive ? all : all.filter((row) => row.isActive))
      }),

      api.withdrawService(() => {
        onTheMenu = false
        return new HttpResponse(null, { status: 204 })
      }),

      api.updateService(async ({ request }) => {
        const body = (await request.json()) as { isActive: boolean }
        onTheMenu = body.isActive
        return HttpResponse.json({ ...WOMENS_CUT, isActive: onTheMenu })
      }),
    ]
  }

  it('drops a withdrawn service from the menu, and puts it back when it returns', async () => {
    server.use(...salon())

    signedInAs('Admin')
    renderRoute('/', { staleTime: Infinity })

    const typist = userEvent.setup()

    // The menu, as a client would be served it.
    expect(await screen.findByText('Women’s cut')).toBeInTheDocument()

    await typist.click(screen.getByRole('link', { name: 'Services' }))
    await screen.findByRole('heading', { name: 'Services' })

    await typist.click(screen.getByRole('checkbox', { name: /show inactive/i }))
    await typist.click(await screen.findByRole('switch', { name: /Women’s cut/ }))
    await typist.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /withdraw it/i }),
    )

    // Still in the catalogue, and now saying what it is. This is ADR-0012: withdrawn is not
    // gone, and an admin can still find it in order to put it back.
    expect(await screen.findByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Women’s cut')).toBeInTheDocument()

    await typist.click(screen.getByRole('link', { name: 'Menu' }))

    expect(await screen.findByRole('heading', { name: /nothing on the menu yet/i })).toBeInTheDocument()
    expect(screen.queryByText('Women’s cut')).not.toBeInTheDocument()

    // And back again. Reactivating is why the question never says this cannot be undone.
    await typist.click(screen.getByRole('link', { name: 'Services' }))
    await typist.click(screen.getByRole('checkbox', { name: /show inactive/i }))
    await typist.click(await screen.findByRole('switch', { name: /Women’s cut/ }))

    await waitFor(() => expect(screen.queryByText('Inactive')).not.toBeInTheDocument())

    await typist.click(screen.getByRole('link', { name: 'Menu' }))
    expect(await screen.findByText('Women’s cut')).toBeInTheDocument()
  })
})

/**
 * The same focus question as the panel's, for the dialog the toggle opens. `ConfirmDialog` is
 * Radix too, and carries the same trap: see `ui/openerFocus.ts`.
 */
describe('withdrawing, with a keyboard', () => {
  it('puts the switch back and returns focus to it when the question is declined', async () => {
    const withdrawn: string[] = []

    server.use(
      api.services(() => HttpResponse.json([WOMENS_CUT])),
      api.withdrawService(({ params }) => {
        withdrawn.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    signedInAs('Admin')
    renderRoute('/admin/services?includeInactive=true')

    const typist = userEvent.setup()
    const toggle = await screen.findByRole('switch', { name: /Women’s cut/ })
    await typist.click(toggle)

    await screen.findByRole('dialog')
    await typist.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Nothing was sent, the switch says what the catalogue still says, and the admin is back
    // on the control they moved rather than at the top of the document.
    expect(withdrawn).toEqual([])
    expect(toggle).toBeChecked()
    await waitFor(() => expect(document.activeElement).toBe(toggle))
  })
})
