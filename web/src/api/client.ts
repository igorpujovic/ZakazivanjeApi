/**
 * The one way the application talks to the API.
 *
 * Types are generated (`schema.d.ts`) so the contract cannot drift; the call sites are written
 * by hand, because how refusals are recovered from and how caches are invalidated is the work
 * worth being able to read — a generated client would hide exactly that.
 *
 * Requests go to `/api/...` relative, so the Vite dev proxy makes development same-origin.
 */

import { NetworkError, problemToApiError } from './errors'

export type QueryValue = string | number | boolean | undefined | null

/** Set by the session once it exists (issue 04). Until then, every request is anonymous. */
let getToken: () => string | undefined = () => undefined

/** Called when the API answers `401`, so the session can clear itself and redirect. */
let onUnauthorized: (() => void) | undefined

export function setTokenProvider(provider: () => string | undefined): void {
  getToken = provider
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

function buildPath(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs.length > 0 ? `${path}?${qs}` : path
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    // Not JSON: a proxy error page, or an empty 204 that still carried something. The caller
    // gets a synthesised envelope rather than a parse error from inside the client.
    return undefined
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
}

/**
 * Sends one request and returns its parsed body.
 *
 * Throws {@link ApiError} when the API answered and refused, and {@link NetworkError} when it
 * could not be reached — the difference matters to what a client is told.
 *
 * `T` is supplied by the caller from the generated types. It is an assertion, not a
 * validation: the generated types are the contract, and re-validating every response at
 * runtime would be a second schema to maintain.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = options

  const headers = new Headers({ Accept: 'application/json' })
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  const token = getToken()
  if (token !== undefined) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(buildPath(`/api${path}`, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new NetworkError(cause)
  }

  if (!response.ok) {
    const error = problemToApiError(response.status, await readBody(response))
    // A 401 means the token is absent, expired or rejected. The session clears itself and
    // sends the visitor to login; the error still propagates so the caller can stop.
    if (response.status === 401) onUnauthorized?.()
    throw error
  }

  if (response.status === 204) return undefined as T
  return (await readBody(response)) as T
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
