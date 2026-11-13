import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from './app/routes'
import { isApiError } from './api/errors'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Slots go stale the moment someone else books. Everything that matters is refetched
      // explicitly after a mutation, so a short stale time is enough and polling is not.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // A refusal is an answer, not a failure: retrying a 409 or a 404 cannot change it, and
        // retrying a 401 only delays the redirect to login.
        if (isApiError(error)) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Never automatic. `booking_contended` is the one refusal worth trying again, and the
      // person decides that with a button — a silent retry would hide the race the booking
      // page exists to explain.
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
