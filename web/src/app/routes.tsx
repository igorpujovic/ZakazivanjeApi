import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { RequireAdmin, RequireSession } from '../auth/guards'
import { BookPage } from '../pages/BookPage'
import { LoginPage } from '../pages/LoginPage'
import { MenuPage } from '../pages/MenuPage'
import { AdminBookingsPage } from '../pages/AdminBookingsPage'
import { AdminServicesPage } from '../pages/AdminServicesPage'
import { AdminStylistsPage } from '../pages/AdminStylistsPage'
import { MyBookingsPage } from '../pages/MyBookingsPage'
import { RegisterPage } from '../pages/RegisterPage'
import { EmptyState } from '../ui/EmptyState'
import { AppRoot } from './AppRoot'

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
 *
 * Who may see what is expressed here, as two guard layouts, rather than inside each page: the
 * rule sits next to the addresses it governs, and a page added to a guarded group inherits it
 * without anyone having to remember.
 */

/** Exported separately from {@link router} so tests can mount the real tree in memory. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppRoot />,
    children: [
      { index: true, element: <MenuPage /> },

      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },

      {
        element: <RequireSession />,
        children: [
          { path: 'book', element: <BookPage /> },
          { path: 'bookings', element: <MyBookingsPage /> },
        ],
      },

      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          { path: 'bookings', element: <AdminBookingsPage /> },
          { path: 'services', element: <AdminServicesPage /> },
          { path: 'stylists', element: <AdminStylistsPage /> },
        ],
      },

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
]

/**
 * Every address is under this prefix.
 *
 * `/` when the application is served from the root of its own origin, which is how it runs
 * against the API. The published demo is a GitHub Pages *project* site, so it lives under
 * `/<repository>/` instead, and the router has to be told — otherwise it reads that first
 * segment as part of the route and answers every address with "Page not found".
 *
 * Vite substitutes `BASE_URL` at build time from the `base` in `vite.config.ts`, so this is
 * one source for the router, the asset URLs and the service worker's scope rather than three
 * places to keep in step. React Router wants it without the trailing slash.
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(routes, { basename: basename || '/' })
