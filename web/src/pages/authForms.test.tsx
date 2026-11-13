import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  api,
  authResult,
  CREDENTIALS_REFUSED,
  EMAIL_TAKEN,
  HttpResponse,
  server,
  user,
} from '../test/apiMocks'
import { renderRoute } from '../test/renderRoute'

/**
 * The four things issue 04 promises about the two forms, proved against a mocked API rather
 * than by reading the code:
 *
 *   - registering and being signed in is one submission
 *   - an email already in use lands on the email field
 *   - a wrong password gets the login screen's own words, identical whether the email exists
 *   - register-succeeded-login-failed does not read as "registration failed"
 *
 * The bodies the mock answers with are the ones a running instance really sends; see
 * `test/apiMocks.ts`.
 */

beforeAll(() => {
  // An unhandled request fails loudly. A test whose mock silently missed would otherwise pass
  // by reaching nothing at all.
  server.listen({ onUnhandledFrame: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  sessionStorage.clear()
})

const fillRegisterForm = async () => {
  const typist = userEvent.setup()

  await typist.type(screen.getByLabelText('Name'), 'Mina Maric')
  await typist.type(screen.getByLabelText('Email'), 'mina@example.test')
  await typist.type(screen.getByLabelText('Password'), 'a-good-password')

  return typist
}

describe('opening an account', () => {
  it('is one submission: register, then signed in, then back where you were headed', async () => {
    const sent: Array<{ route: string; body: unknown }> = []

    server.use(
      api.register(async ({ request }) => {
        sent.push({ route: 'register', body: await request.json() })
        // 201 with a UserResponse and no token: registering does not sign anyone in, which is
        // the whole reason this form has to chain a second call.
        return HttpResponse.json(user(), { status: 201 })
      }),
      api.login(async ({ request }) => {
        sent.push({ route: 'login', body: await request.json() })
        return HttpResponse.json(authResult())
      }),
    )

    const { currentPath } = renderRoute('/register?returnTo=%2Fbook')

    const typist = await fillRegisterForm()
    await typist.click(screen.getByRole('button', { name: /create account/i }))

    // Landed where they were going, not on a second form asking for the password again.
    await waitFor(() => {
      expect(currentPath()).toBe('/book')
    })

    // Both calls happened, in order, and login reused the credentials already in memory, so
    // nobody was asked to type them twice.
    expect(sent.map((call) => call.route)).toEqual(['register', 'login'])
    expect(sent[1]?.body).toEqual({ email: 'mina@example.test', password: 'a-good-password' })

    // And they are signed in: the shell offers the way out rather than the way in.
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('puts an email already in use on the email field', async () => {
    server.use(api.register(() => HttpResponse.json(EMAIL_TAKEN, { status: 409 })))

    renderRoute('/register')

    const typist = await fillRegisterForm()
    await typist.click(screen.getByRole('button', { name: /create account/i }))

    const email = screen.getByLabelText('Email')

    /*
     * `email_taken` is a 409 from `AuthService`, not a DataAnnotations 400, so it arrives with
     * no `errors` map and no field attached to it. It is unmistakably about the email, so the
     * form puts it there rather than leaving a banner over a box that looks perfectly fine.
     */
    await waitFor(() => {
      expect(email).toHaveAttribute('aria-invalid', 'true')
    })

    expect(screen.getByText('An account with that email already exists.')).toBeInTheDocument()

    // Still on the form, with what they typed intact, so the only thing to change is the one
    // field being complained about.
    expect(screen.getByLabelText('Name')).toHaveValue('Mina Maric')
  })

  /**
   * The account exists; only the sign-in that should have followed did not. Saying
   * "registration failed" would be false, and would walk them into `email_taken` on their own
   * address if they tried again.
   */
  it('does not call a created account a failure when only the sign-in failed', async () => {
    server.use(
      api.register(() => HttpResponse.json(user(), { status: 201 })),
      api.login(() => HttpResponse.json({ status: 500, code: 'http_500' }, { status: 500 })),
    )

    const { currentPath } = renderRoute('/register?returnTo=%2Fbook')

    const typist = await fillRegisterForm()
    await typist.click(screen.getByRole('button', { name: /create account/i }))

    // Moved to the login form, keeping where they were headed.
    await waitFor(() => {
      expect(currentPath()).toBe('/login?returnTo=%2Fbook')
    })

    expect(screen.getByText(/your account was created/i)).toBeInTheDocument()

    // Email prefilled, so the one thing left to supply is the password.
    expect(screen.getByLabelText('Email')).toHaveValue('mina@example.test')
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })
})

describe('a wrong password', () => {
  const signInWith = async (email: string) => {
    server.use(api.login(() => HttpResponse.json(CREDENTIALS_REFUSED, { status: 401 })))

    renderRoute('/login')

    const typist = userEvent.setup()
    await typist.type(screen.getByLabelText('Email'), email)
    await typist.type(screen.getByLabelText('Password'), 'not-the-password')
    await typist.click(screen.getByRole('button', { name: /^sign in$/i }))

    return (await screen.findByRole('alert')).textContent
  }

  it("gets the login screen's own words rather than the API's prose", async () => {
    const shown = await signInWith('mina@example.test')

    expect(shown).toBe('That email and password do not match an account.')

    // Deliberately not the API's `detail`. The UI knows what the visitor was trying to do, so
    // it can say something better than a generic sentence (see `lib/errorCopy.ts`).
    expect(shown).not.toContain('Email or password is incorrect.')
  })

  /**
   * The API answers identically for an unknown email and a wrong password, on purpose, so that
   * the endpoint cannot be used to find out who has an account here. The UI must not undermine
   * that by being more specific than the API was.
   */
  it('reads the same whether the email exists or not', async () => {
    const forKnown = await signInWith('mina@example.test')

    // Two sign-in attempts in one test, so the first screen has to go: cleanup only runs
    // between tests, and two login forms at once would make every query ambiguous.
    cleanup()

    const forUnknown = await signInWith('nobody@example.test')

    expect(forUnknown).toBe(forKnown)
    expect(forUnknown).not.toMatch(/account.*(exist|found|unknown)|no such/i)
  })

  it('leaves you on the login form, able to try again, with no session stored', async () => {
    await signInWith('mina@example.test')

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
    expect(sessionStorage.getItem('salon.session')).toBeNull()
  })
})
