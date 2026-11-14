import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { routes } from '../app/routes'
import { SESSION_STORAGE_KEY, type Session } from '../auth/session'

/**
 * Renders the application at a given address.
 *
 * Against `routes` itself, not a hand-built imitation of it: the thing worth proving about a
 * guard is that it is wired into the real route tree, and a test that rebuilt the tree would
 * pass with the guard missing from the application.
 *
 * The provider nesting matches `main.tsx` — query client outside the router, session inside it,
 * because the session needs `useNavigate`.
 */
export interface RenderRouteOptions {
  /**
   * How long a fetched answer counts as fresh. `0` by default, as the application runs.
   *
   * `Infinity` is for one kind of test: the ones that claim a cache was *invalidated*. With
   * the default, every query refetches on mount anyway, so a screen re-asking proves nothing
   * — the test would pass with the invalidation deleted. Freezing the cache means the only
   * thing that can make a screen re-ask is having been told its answer is stale.
   */
  staleTime?: number
}

export function renderRoute(path: string, { staleTime = 0 }: RenderRouteOptions = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { ...result, router, currentPath: () => router.state.location.pathname + router.state.location.search }
}

/**
 * A session on disk before the application starts, as a returning visitor would have.
 *
 * `who` names a particular person, for the tests that need *two* of them — whether a client
 * sees only their own bookings is not a question one identity can answer. The token is part of
 * that identity, because the token is the only thing that tells the API whose data to send:
 * `GET /api/bookings/my` takes no client id, so a test about two clients has to be a test
 * about two tokens.
 */
export function signedInAs(
  role: 'Client' | 'Admin',
  expiresAt = '2099-01-01T00:00:00Z',
  who: Partial<Session['user']> & { accessToken?: string } = {},
): Session {
  const { accessToken = 'a-token', ...user } = who

  const session: Session = {
    accessToken,
    expiresAt,
    user: {
      id: role === 'Admin' ? 1 : 7,
      name: role === 'Admin' ? 'Salon' : 'Mina',
      email: `${role.toLowerCase()}@example.test`,
      role,
      ...user,
    },
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}
