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
import { afterAll, afterEach, beforeAll } from 'vitest'

import type { AuthResult, AvailableSlots, Booking, Service, Stylist, User } from '../api/dto'
import type { components } from '../api/schema'
import { asWallClock, asWallClockDate } from '../lib/wallClock'

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

/** The status line .NET writes for each status this file uses. */
const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'An error occurred while processing your request.',
}

/** A refusal, in the one envelope every layer of the API uses (ADR-0008). */
export const problem = (status: number, code: string, detail?: string): ProblemDetails => ({
  type: `https://tools.ietf.org/html/rfc9110#section-15.5.${status}`,
  title: TITLES[status],
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

type Get = Parameters<typeof http.get>[1]
type Post = Parameters<typeof http.post>[1]

export const api = {
  login: (resolver: Post) => http.post(`${API}/auth/login`, resolver),
  register: (resolver: Post) => http.post(`${API}/auth/register`, resolver),

  services: (resolver: Get) => http.get(`${API}/services`, resolver),
  stylists: (resolver: Get) => http.get(`${API}/stylists`, resolver),

  /** One handler for every stylist: the resolver reads `params.id` to answer as that one. */
  availableSlots: (resolver: Get) => http.get(`${API}/stylists/:id/available-slots`, resolver),

  createBooking: (resolver: Post) => http.post(`${API}/bookings`, resolver),
  myBookings: (resolver: Get) => http.get(`${API}/bookings/my`, resolver),
}

export { http, HttpResponse }

/**
 * No default handlers. Each test states the two answers it is about, so what is being proved
 * is visible in the test rather than in a shared file — and an unhandled request fails the
 * suite instead of silently reaching the network.
 */
export const server = setupServer()

// -- The catalogue, slots and bookings --------------------------------------------------
//
// Added by issue 05. Same rule as everything above: every body is typed from the generated
// schema, and the shapes were read off a running instance rather than imagined — in
// particular `AvailableSlotsResponse` really does carry `durationMinutes` beside the starts,
// which is what lets the grid label a slot with its end time without a second lookup.

export const service = (overrides: Partial<Service> = {}): Service => ({
  id: 3,
  name: 'Women’s cut',
  durationMinutes: 60,
  price: 2500,
  isActive: true,
  ...overrides,
})

export const stylist = (overrides: Partial<Stylist> = {}): Stylist => ({
  id: 1,
  name: 'Ana',
  isActive: true,
  ...overrides,
})

/**
 * A day's answer for one stylist. `starts` are bare `"09:00"` strings for readability; the
 * date they belong to is the one being asked about, exactly as the API echoes it back.
 */
export const availableSlots = (
  date: string,
  durationMinutes: number,
  ...starts: string[]
): AvailableSlots => ({
  date: asWallClockDate(date),
  durationMinutes,
  slots: starts.map((start) => asWallClock(`${date}T${start}:00`)),
})

export const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 41,
  start: asWallClock('2026-11-20T09:00:00'),
  end: asWallClock('2026-11-20T10:00:00'),
  status: 'Scheduled',
  stylistId: 1,
  stylistName: 'Ana',
  serviceId: 3,
  serviceName: 'Women’s cut',
  price: 2500,
  clientId: 7,
  clientName: 'Mina Marić',
  ...overrides,
})

/** The refusals the booking page has a distinct recovery for. */
export const SLOT_TAKEN = problem(
  409,
  'booking_overlap',
  'That stylist already has a booking overlapping this time.',
)

export const CONTENDED = problem(
  409,
  'booking_contended',
  'The stylist’s schedule is being changed by someone else. Please try again.',
)

export const STYLIST_RETIRED = problem(
  409,
  'stylist_inactive',
  'That stylist is no longer taking bookings.',
)

/**
 * The server's lifecycle, in one call, so each screen's test file says what it proves rather
 * than how MSW is started.
 *
 * `onUnhandledFrame: 'error'` is the important part: a request nothing answered fails the test
 * loudly instead of passing by having reached nothing at all. That is how the fan-out is held
 * honest — a grid built from four stylists must really have asked about four stylists.
 */
export function serveMockApi(): void {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
    sessionStorage.clear()
  })

  afterAll(() => {
    server.close()
  })
}

export const SERVICE_WITHDRAWN = problem(
  409,
  'service_inactive',
  'That service is no longer on offer.',
)

/** A `500`: logged server-side, and the body says nothing more than the code. */
export const UNFORESEEN = problem(500, 'internal_error')
