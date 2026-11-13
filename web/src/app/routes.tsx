import { createBrowserRouter } from 'react-router-dom'

import { EmptyState } from '../ui/EmptyState'
import { AppShell } from './AppShell'
import { Pending } from './Pending'

/**
 * The eight routes, and nothing more.
 *
 * There is no team page and no service detail page on purpose: `StylistResponse` is
 * `{ id, name, isActive }` and `ServiceResponse` has no description, so both would show
 * exactly what the lists already show. `GET /api/services/{id}` is used by the admin edit
 * panel instead, being the only route that returns an inactive service by id.
 *
 * Create and edit open a side panel rather than a route, which is what keeps this list at
 * eight.
 */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Pending screen="The menu" issue="05" /> },
      { path: 'book', element: <Pending screen="Book an appointment" issue="05" /> },
      { path: 'bookings', element: <Pending screen="My bookings" issue="06" /> },
      { path: 'login', element: <Pending screen="Sign in" issue="04" /> },
      { path: 'register', element: <Pending screen="Create an account" issue="04" /> },
      { path: 'admin/bookings', element: <Pending screen="All bookings" issue="07" /> },
      { path: 'admin/services', element: <Pending screen="Services" issue="08" /> },
      { path: 'admin/stylists', element: <Pending screen="Stylists" issue="08" /> },
      {
        path: '*',
        element: (
          <EmptyState title="Page not found">
            That address does not exist. Try the menu.
          </EmptyState>
        ),
      },
    ],
  },
])
