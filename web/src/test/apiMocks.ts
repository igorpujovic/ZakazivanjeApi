/**
 * The API, mocked, with the contract still in charge.
 *
 * Every body below is typed from `src/api/schema.d.ts` — the generated types — so a mock
 * cannot quietly drift from the API the way a hand-written fixture would. If a DTO changes
 * shape and these are not updated, `tsc` fails here rather than the suite passing against an
 * API that no longer exists.
 *
 * The shapes are not invented either. They were taken from a running instance: a `201` with a
 * `UserResponse` and no token from register, a `409` carrying `email_taken` and no `errors`
 * map, a `401` carrying `invalid_credentials` with prose identical for a wrong password and an
 * unknown email, and a `200` whose `expiresAt` has seven fractional digits and an offset.
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { AuthResult, User } from '../api/dto'
import type { components } from '../api/schema'

type ProblemDetails = components['schemas']['ProblemDetails']
type ValidationProblemDetails = components['schemas']['ValidationProblemDetails']

/**
 * Handlers use absolute URLs because the application sends relative ones (`/api/...`, so the
 * Vite proxy makes development same-origin) and jsdom resolves those against its own origin.
 */
const API = 'http://localhost:3000/api'

export const user = (overrides: Partial<User> = {}): User => ({
  id: 7,
  name: 'Mina Marić',
  email: 'mina@example.test',
  role: 'Client',
  ...overrides,
})

/**
 * A live session. `expiresAt` is written the way .NET really writes a `DateTimeOffset` —
 * seven fractional digits and an offset — because that is the string `Date.parse` has to cope
 * with, and a tidier one would make the mock easier than the real thing.
 */
export const authResult = (overrides: Partial<AuthResult> = {}): AuthResult => ({
  accessToken: 'a-signed-token',
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T10:30:00.5246027+00:00',
  user: user(),
  ...overrides,
})

/** A refusal, in the one envelope every layer of the API uses (ADR-0008). */
export const problem = (status: number, code: string, detail?: string): ProblemDetails => ({
  type: `https://tools.ietf.org/html/rfc9110#section-15.5.${status}`,
  title: status === 409 ? 'Conflict' : 'Unauthorized',
  status,
  detail,
  code,
})

/** A `400` from DataAnnotations. Keys PascalCase, as a running instance confirmed. */
export const validationProblem = (
  errors: Record<string, string[]>,
): ValidationProblemDetails => ({
  type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
  title: 'One or more validation errors occurred.',
  status: 400,
  errors,
  code: 'invalid_request',
})

/** What the real API answers for a wrong password *and* for an email it has never seen. */
export const CREDENTIALS_REFUSED = problem(
  401,
  'invalid_credentials',
  'Email or password is incorrect.',
)

export const EMAIL_TAKEN = problem(
  409,
  'email_taken',
  'An account with that email already exists.',
)

export const api = {
  login: (resolver: Parameters<typeof http.post>[1]) => http.post(`${API}/auth/login`, resolver),
  register: (resolver: Parameters<typeof http.post>[1]) =>
    http.post(`${API}/auth/register`, resolver),
}

export { http, HttpResponse }

/**
 * No default handlers. Each test states the two answers it is about, so what is being proved
 * is visible in the test rather than in a shared file — and an unhandled request fails the
 * suite instead of silently reaching the network.
 */
export const server = setupServer()
