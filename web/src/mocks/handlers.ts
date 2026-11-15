/**
 * The demo salon's answers, in the shapes the real API uses.
 *
 * Read `salon.ts` first for what this is and is not. Every body here is typed from the
 * generated schema, and every refusal is the one envelope ADR-0008 defines carrying the `code`
 * the API would have sent — because the frontend branches on those codes, and a mock that
 * invented its own would exercise the fallback path instead of the interesting one.
 */

import { http, HttpResponse, type HttpResponseResolver, type PathParams } from 'msw'

import type {
  Account,
} from './salon'
import type {
  AuthResult,
  AvailableSlots,
  Booking,
  CreateBookingBody,
  CreateServiceBody,
  CreateStylistBody,
  LoginBody,
  PagedBookings,
  RegisterBody,
  Service,
  Stylist,
  UpdateServiceBody,
  UpdateStylistBody,
  User,
} from '../api/dto'
import type { components } from '../api/schema'
import {
  addMinutes,
  asWallClock,
  asWallClockDate,
  dateOf,
  isBefore,
  nowWallClock,
} from '../lib/wallClock'
import { Salon } from './salon'

type ProblemDetails = components['schemas']['ProblemDetails']

/** Sign in as this to reach the admin screens. Printed to the console when the demo starts. */
export const ADMIN_EMAIL = 'admin@salon.demo'
export const ADMIN_PASSWORD = 'demo'

const salon = new Salon()

/** The same catalogue the API seeds, so the demo matches the screenshots in the README. */
function seed(): void {
  salon.services = (
    [
      ["Women's Cut", 45, 2500],
      ["Men's Cut", 30, 1500],
      ['Colouring', 120, 6000],
      ['Highlights', 150, 7500],
      ['Blow Dry', 30, 1200],
      ['Wash and Style', 45, 1800],
    ] as const
  ).map(([name, durationMinutes, price]) => ({
    id: salon.id(),
    name,
    durationMinutes,
    price,
    isActive: true,
  }))

  salon.stylists = ['Nina', 'Marko', 'Jelena', 'Stefan'].map((name) => ({
    id: salon.id(),
    name,
    isActive: true,
  }))

  // An admin to sign in as, since there is no way to register one (ADR-0006).
  salon.accounts = [
    {
      user: { id: salon.id(), name: 'Salon administrator', email: ADMIN_EMAIL, role: 'Admin' },
      password: ADMIN_PASSWORD,
      token: 'demo-admin-token',
    },
  ]
}

/**
 * The salon this tab was already using, or a freshly seeded one.
 *
 * Restoring first is what makes a reload survivable: the session in `sessionStorage` names an
 * account, and reseeding would throw that account away while the session went on naming it.
 */
export function restoreOrSeed(): void {
  if (!salon.restore()) {
    seed()
    salon.save()
  }
}

/** Writes the salon down. Called after every request that changed it — see `browser.ts`. */
export function persist(): void {
  salon.save()
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
}

/** A refusal in the one envelope, carrying the code the frontend branches on. */
function problem(status: number, code: string, detail: string) {
  const body: ProblemDetails = {
    type: `https://tools.ietf.org/html/rfc9110#section-15.5.${status}`,
    title: TITLES[status],
    status,
    detail,
    code,
  }

  return HttpResponse.json(body, { status })
}

const unauthorized = () => problem(401, 'unauthorized', 'Sign in to continue.')
const forbidden = () => problem(403, 'forbidden', 'This is for salon staff.')

const INVALID_REQUEST = (detail: string) => problem(400, 'invalid_request', detail)

const NO_SUCH_SERVICE = () => problem(404, 'service_not_found', 'No such service.')
const NO_SUCH_STYLIST = () => problem(404, 'stylist_not_found', 'No such stylist.')
const NO_SUCH_BOOKING = () => problem(404, 'booking_not_found', 'No such booking.')

/** Whoever the bearer token names, or `undefined` for a caller the salon cannot identify. */
function caller(request: Request): Account | undefined {
  const header = request.headers.get('authorization') ?? ''
  return salon.accountByToken(header.replace(/^Bearer\s+/i, '') || undefined)
}

interface Call {
  request: Request
  params: PathParams
}

/**
 * A query parameter, found whatever its capitalisation.
 *
 * ASP.NET Core binds query parameters case-insensitively, so the real API answers the same
 * whether a client sends `?date=` or `?Date=`. This frontend sends PascalCase for the bound
 * ones — `Date`, `ServiceId`, `StylistId`, `Page`, `PageSize` — and camelCase for
 * `includeInactive`, which is a bare parameter. A mock matching one spelling exactly would
 * answer 404 to half of them, which is precisely the bug this replaced.
 */
function query({ request }: Call): (name: string) => string | undefined {
  const found = new Map<string, string>()

  for (const [key, value] of new URL(request.url).searchParams) {
    found.set(key.toLowerCase(), value)
  }

  return (name) => found.get(name.toLowerCase())
}

/** The `:id` of a route, as a number. */
const idOf = ({ params }: Call): number => Number(String(params.id))

/** Whether the caller asked to widen a catalogue list to everything. */
const wantsWholeCatalogue = (call: Call): boolean => query(call)('includeInactive') === 'true'

/**
 * Wraps a resolver so it runs only for a caller the salon can identify, and optionally only
 * for an admin — the `401` / `403` division every protected route in the API makes.
 */
function authorised(
  resolve: (call: Call, account: Account) => Response | Promise<Response>,
  { adminOnly = false } = {},
): HttpResponseResolver {
  return async ({ request, params }) => {
    const account = caller(request)

    if (account === undefined) return unauthorized()
    if (adminOnly && account.user.role !== 'Admin') return forbidden()

    return resolve({ request, params }, account)
  }
}

/**
 * When this demo's token stops being accepted, as a real instant with its zone attached.
 *
 * `expiresAt` is the one value in this API that is *not* a wall-clock reading: the real
 * `JwtTokenService` builds it from `GetUtcNow()`, so it is a `DateTimeOffset` (see
 * `auth/session.ts`). An hour, matching the token lifetime in `appsettings.json`.
 *
 * Written out from UTC components rather than with `toISOString`, which
 * `lib/noConversions.test.ts` bans everywhere in `src/`. The ban is blunt on purpose — it
 * scans the whole tree so that a conversion cannot hide in a corner — and a demo is not a
 * good enough reason to carve an exception into it. The shape is the one .NET really writes:
 * a `Z`, and fractional seconds.
 */
function anInstantAnHourFromNow(): string {
  const at = new Date(Date.now() + 60 * 60_000)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')

  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}` +
    `.${pad(at.getUTCMilliseconds(), 3)}0000Z`
  )
}

/** The response shape for a booking, built from the rows it points at. */
function bookingFrom(
  start: string,
  service: Service,
  stylist: Stylist,
  client: User,
): Booking {
  const at = asWallClock(start)

  return {
    id: salon.id(),
    start: at,
    end: addMinutes(at, service.durationMinutes),
    status: 'Scheduled',
    stylistId: stylist.id,
    stylistName: stylist.name,
    serviceId: service.id,
    serviceName: service.name,
    price: service.price,
    clientId: client.id,
    clientName: client.name,
  }
}

export const handlers = [
  // -- Auth ------------------------------------------------------------------------------

  http.post('*/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as RegisterBody

    if (salon.accountByEmail(body.email) !== undefined) {
      return problem(409, 'email_taken', 'An account with that email already exists.')
    }

    const user: User = { id: salon.id(), name: body.name, email: body.email, role: 'Client' }
    salon.accounts.push({ user, password: body.password, token: `demo-token-${user.id}` })

    // `201` with the user and *no token*, as the API answers — which is why the register form
    // chains a login. A mock that returned a token here would hide that entirely.
    return HttpResponse.json(user, { status: 201 })
  }),

  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginBody
    const account = salon.accountByEmail(body.email)

    // The same answer for an unknown email and for a wrong password, deliberately: the
    // endpoint must not be usable to find out who has an account.
    if (account === undefined || account.password !== body.password) {
      return problem(401, 'invalid_credentials', 'Email or password is incorrect.')
    }

    const result: AuthResult = {
      accessToken: account.token,
      tokenType: 'Bearer',
      expiresAt: anInstantAnHourFromNow(),
      user: account.user,
    }

    return HttpResponse.json(result)
  }),

  // -- The catalogue ---------------------------------------------------------------------

  http.get('*/api/services', (call) => {
    if (!wantsWholeCatalogue(call)) {
      return HttpResponse.json(salon.services.filter((s) => s.isActive))
    }

    // Refused rather than quietly narrowed to the menu (ADR-0012).
    const account = caller(call.request)
    if (account === undefined) return unauthorized()
    if (account.user.role !== 'Admin') return forbidden()

    return HttpResponse.json(salon.services)
  }),

  http.get('*/api/services/:id', (call) => {
    // Answers with a withdrawn service too, which is what lets a booking against one render.
    const service = salon.service(idOf(call))
    return service === undefined ? NO_SUCH_SERVICE() : HttpResponse.json(service)
  }),

  http.post(
    '*/api/services',
    authorised(
      async ({ request }) => {
        const { name, durationMinutes, price } = (await request.json()) as CreateServiceBody

        // The generated request type makes these optional, because that is what the OpenAPI
        // document says; the API refuses a body without them, so this does too.
        if (!name || durationMinutes == null || price == null) {
          return INVALID_REQUEST('A service needs a name, a duration and a price.')
        }

        const service: Service = { id: salon.id(), name, durationMinutes, price, isActive: true }

        salon.services.push(service)
        return HttpResponse.json(service, { status: 201 })
      },
      { adminOnly: true },
    ),
  ),

  http.put(
    '*/api/services/:id',
    authorised(
      async (call) => {
        const service = salon.service(idOf(call))
        if (service === undefined) return NO_SUCH_SERVICE()

        Object.assign(service, (await call.request.json()) as UpdateServiceBody)
        return HttpResponse.json(service)
      },
      { adminOnly: true },
    ),
  ),

  http.delete(
    '*/api/services/:id',
    authorised(
      (call) => {
        const service = salon.service(idOf(call))
        if (service === undefined) return NO_SUCH_SERVICE()

        // Nothing is deleted. The row stays, every booking against it stays, and it leaves
        // the menu — ADR-0004 in one line.
        service.isActive = false
        return new HttpResponse(null, { status: 204 })
      },
      { adminOnly: true },
    ),
  ),

  http.get('*/api/stylists', (call) => {
    if (!wantsWholeCatalogue(call)) {
      return HttpResponse.json(salon.stylists.filter((s) => s.isActive))
    }

    const account = caller(call.request)
    if (account === undefined) return unauthorized()
    if (account.user.role !== 'Admin') return forbidden()

    return HttpResponse.json(salon.stylists)
  }),

  http.post(
    '*/api/stylists',
    authorised(
      async ({ request }) => {
        const { name } = (await request.json()) as CreateStylistBody
        if (!name) return INVALID_REQUEST('A stylist needs a name.')

        const stylist: Stylist = { id: salon.id(), name, isActive: true }

        salon.stylists.push(stylist)
        return HttpResponse.json(stylist, { status: 201 })
      },
      { adminOnly: true },
    ),
  ),

  http.put(
    '*/api/stylists/:id',
    authorised(
      async (call) => {
        const stylist = salon.stylist(idOf(call))
        if (stylist === undefined) return NO_SUCH_STYLIST()

        Object.assign(stylist, (await call.request.json()) as UpdateStylistBody)
        return HttpResponse.json(stylist)
      },
      { adminOnly: true },
    ),
  ),

  // -- Slots -----------------------------------------------------------------------------

  http.get('*/api/stylists/:id/available-slots', (call) => {
    const param = query(call)
    const date = param('date')

    const stylist = salon.stylist(idOf(call))
    if (stylist === undefined) return NO_SUCH_STYLIST()

    const service = salon.service(Number(param('serviceId')))
    if (service === undefined) return NO_SUCH_SERVICE()
    if (date === undefined) return INVALID_REQUEST('A date is required.')

    // An empty list is an answer, not a failure: a closed day, a retired stylist and a fully
    // booked day all come back the same way.
    const body: AvailableSlots = {
      date: asWallClockDate(date),
      durationMinutes: service.durationMinutes,
      slots: salon.availableStarts(stylist.id, date, service, nowWallClock()),
    }

    return HttpResponse.json(body)
  }),

  // -- Bookings --------------------------------------------------------------------------

  http.post(
    '*/api/bookings',
    authorised(async ({ request }, account) => {
      const body = (await request.json()) as CreateBookingBody

      if (body.serviceId == null || body.stylistId == null || body.start == null) {
        return INVALID_REQUEST('A booking needs a service, a stylist and a start.')
      }

      const service = salon.service(body.serviceId)
      if (service === undefined) return NO_SUCH_SERVICE()

      const stylist = salon.stylist(body.stylistId)
      if (stylist === undefined) return NO_SUCH_STYLIST()

      if (!service.isActive) {
        return problem(409, 'service_inactive', 'That service is no longer on offer.')
      }
      if (!stylist.isActive) {
        return problem(409, 'stylist_inactive', 'That stylist is no longer taking bookings.')
      }

      const start = asWallClock(body.start)
      const end = addMinutes(start, service.durationMinutes)

      if (isBefore(start, nowWallClock())) {
        return problem(409, 'start_in_past', 'That start time has already passed.')
      }

      // The race the booking page exists to explain.
      //
      // The demo cannot stage it: the salon lives in one tab's `sessionStorage`, so a second
      // tab is a second salon and there is nobody to lose the race to. Seeing it needs the
      // real API and two clients — `pages/bookPage.test.tsx` proves the recovery, and the
      // README has a screenshot of it happening. This branch is still reachable here by
      // booking a slot and then confirming a stale grid that still offers it.
      if (!salon.isFree(stylist.id, start, end)) {
        return problem(
          409,
          'booking_overlap',
          'That stylist already has a booking overlapping this time.',
        )
      }

      const booking = bookingFrom(start, service, stylist, account.user)
      salon.bookings.push(booking)

      return HttpResponse.json(booking, { status: 201 })
    }),
  ),

  http.get(
    '*/api/bookings/my',
    authorised((_call, account) =>
      HttpResponse.json(
        salon.bookings
          .filter((b) => b.clientId === account.user.id)
          .sort((a, b) => a.start.localeCompare(b.start)),
      ),
    ),
  ),

  http.get(
    '*/api/bookings',
    authorised(
      (call) => {
        const param = query(call)
        const date = param('date')
        const stylistId = param('stylistId')
        const page = Number(param('page') ?? '1')
        const pageSize = Math.min(Number(param('pageSize') ?? '20'), 100)

        let rows = [...salon.bookings]
        if (date) rows = rows.filter((b) => dateOf(b.start) === date)
        if (stylistId) rows = rows.filter((b) => b.stylistId === Number(stylistId))

        // Start then id — the tiebreak without which equal-start bookings swap pages.
        rows.sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)

        const body: PagedBookings = {
          items: rows.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          totalCount: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
        }

        return HttpResponse.json(body)
      },
      { adminOnly: true },
    ),
  ),

  http.put(
    '*/api/bookings/:id/cancel',
    authorised((call, account) => {
      const booking = salon.bookings.find((b) => b.id === idOf(call))
      const isAdmin = account.user.role === 'Admin'

      // Somebody else's booking is a `404`, not a `403`: whether it exists is not their
      // business.
      if (booking === undefined || (!isAdmin && booking.clientId !== account.user.id)) {
        return NO_SUCH_BOOKING()
      }

      if (booking.status === 'Cancelled') {
        return problem(409, 'booking_already_cancelled', 'That booking has already been cancelled.')
      }
      if (booking.status === 'Completed') {
        return problem(409, 'booking_already_completed', 'That booking has already been completed.')
      }

      // The deadline binds clients and not the salon.
      if (!isAdmin && !salon.isBeforeCancellationDeadline(booking, nowWallClock())) {
        return problem(409, 'cancellation_too_late', 'A booking can no longer be cancelled.')
      }

      booking.status = 'Cancelled'
      return HttpResponse.json(booking)
    }),
  ),

  http.put(
    '*/api/bookings/:id/complete',
    authorised(
      (call) => {
        const booking = salon.bookings.find((b) => b.id === idOf(call))
        if (booking === undefined) return NO_SUCH_BOOKING()

        if (booking.status === 'Cancelled') {
          return problem(409, 'booking_already_cancelled', 'That booking was cancelled.')
        }
        if (booking.status === 'Completed') {
          return problem(409, 'booking_already_completed', 'That booking is already completed.')
        }
        if (isBefore(nowWallClock(), booking.start)) {
          return problem(409, 'booking_not_started', 'That booking has not started yet.')
        }

        booking.status = 'Completed'
        return HttpResponse.json(booking)
      },
      { adminOnly: true },
    ),
  ),
]
