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
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { ...result, router, currentPath: () => router.state.location.pathname + router.state.location.search }
}

/** A session on disk before the application starts, as a returning visitor would have. */
export function signedInAs(role: 'Client' | 'Admin', expiresAt = '2099-01-01T00:00:00Z'): Session {
  const session: Session = {
    accessToken: 'a-token',
    expiresAt,
    user: { id: role === 'Admin' ? 1 : 7, name: role === 'Admin' ? 'Salon' : 'Mina', email: `${role.toLowerCase()}@example.test`, role },
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}
