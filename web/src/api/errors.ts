/**
 * Refusals, as the API expresses them.
 *
 * Every refusal is `ProblemDetails` (RFC 9457) carrying a machine-readable `code` in its
 * extensions — ADR-0008. The API's README is explicit that `title` and `detail` are prose for
 * a human and may be reworded at any time, so nothing here branches on them.
 *
 * The `code` field itself *is* in the OpenAPI document (the API adds it via a schema
 * transformer), so the generated types already have `code?: string`. What they cannot give us
 * is which codes exist: they are not centralised in C# — some are static members on
 * `BookingRuleResult`, some inline literals in `BookingService`, some in controllers, and
 * anything unlisted is derived as `http_<status>`. So there is deliberately no exhaustive list
 * and no completeness test here, because neither could be honest.
 *
 * Instead {@link HandledErrorCode} names only the codes the UI has its own copy for. Switches
 * over it are exhaustive, with a `default` that falls through to `detail` — which is what the
 * API promises `detail` is for, and means a code the API grows later degrades into a readable
 * message instead of breaking a build.
 */

import type { components } from './schema'

type ProblemDetails = components['schemas']['ProblemDetails']
type ValidationProblemDetails = components['schemas']['ValidationProblemDetails']

/** The codes the UI reacts to distinctly. Everything else renders `detail`. */
export type HandledErrorCode =
  | 'booking_overlap'
  | 'booking_contended'
  | 'start_in_past'
  | 'stylist_inactive'
  | 'service_inactive'
  | 'cancellation_too_late'
  | 'booking_not_started'
  | 'invalid_credentials'
  | 'email_taken'

const HANDLED: ReadonlySet<string> = new Set<HandledErrorCode>([
  'booking_overlap',
  'booking_contended',
  'start_in_past',
  'stylist_inactive',
  'service_inactive',
  'cancellation_too_late',
  'booking_not_started',
  'invalid_credentials',
  'email_taken',
])

export function isHandledErrorCode(code: string | undefined): code is HandledErrorCode {
  return code !== undefined && HANDLED.has(code)
}

/** Field-by-field complaints from a `400`. Keys are whatever the server sent. */
export type FieldErrors = Readonly<Record<string, string[]>>

/**
 * A refusal from the API, with the envelope already parsed.
 *
 * `code` is kept as a plain `string` rather than the narrow union: the API may send one this
 * build has never heard of, and pretending otherwise would be a lie the type system would
 * then enforce. Narrow it with {@link isHandledErrorCode} where the UI needs to.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string | undefined
  readonly title: string | undefined
  readonly fieldErrors: FieldErrors | undefined
  readonly traceId: string | undefined

  constructor(init: {
    status: number
    code: string
    detail?: string
    title?: string
    fieldErrors?: FieldErrors
    traceId?: string
  }) {
    super(init.detail ?? init.title ?? `Request failed with status ${init.status}`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.title = init.title
    this.fieldErrors = init.fieldErrors
    this.traceId = init.traceId
  }

  get isHandled(): boolean {
    return isHandledErrorCode(this.code)
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Raised when the API could not be reached or answered something unparseable. Distinct from
 * {@link ApiError}, which means the API answered and refused: "the salon's system is
 * unreachable" and "the salon says no" are different things to tell someone.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the salon. Check your connection and try again.')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

/**
 * Builds an {@link ApiError} from a response body.
 *
 * Anything the API does not list still carries a code derived as `http_<status>`, so a caller
 * branching on the field never meets a response without one. If the body is not
 * `ProblemDetails` at all — a proxy error page, say — we synthesise the same shape rather than
 * let `undefined` leak into a `switch`.
 */
export function problemToApiError(status: number, body: unknown): ApiError {
  const problem = (body ?? {}) as ProblemDetails & ValidationProblemDetails & { traceId?: unknown }

  const fieldErrors =
    problem.errors && typeof problem.errors === 'object'
      ? (problem.errors as FieldErrors)
      : undefined

  return new ApiError({
    status,
    code: asString(problem.code) ?? `http_${status}`,
    detail: asString(problem.detail),
    title: asString(problem.title),
    fieldErrors,
    traceId: asString(problem.traceId),
  })
}
