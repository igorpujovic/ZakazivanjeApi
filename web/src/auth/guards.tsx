import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { EmptyState } from '../ui/EmptyState'
import { useAuth } from './authContext'
import { loginPathFor } from './returnTo'

/**
 * Who may see what.
 *
 * Both guards are route layouts rather than wrappers around each page, so the access rule sits
 * in `routes.tsx` next to the addresses it governs and a new page cannot be added to the
 * guarded group without inheriting it.
 *
 * Neither is a security boundary. The API is the one that decides, on every request, from the
 * token — these only keep a visitor from being shown a screen that was going to refuse them.
 */

/**
 * Off to the login page, remembering where we were.
 *
 * `replace`, so the guarded address does not sit in the history behind the login page and send
 * the visitor straight back here with the browser's back button.
 */
function RedirectToLogin() {
  const location = useLocation()
  return <Navigate to={loginPathFor(location)} replace />
}

/** `/book` and `/bookings`: anyone signed in. */
export function RequireSession() {
  const { session } = useAuth()

  if (session === undefined) return <RedirectToLogin />

  return <Outlet />
}

/** `/admin/*`: an admin, and nobody else. */
export function RequireAdmin() {
  const { session, isAdmin } = useAuth()

  if (session === undefined) return <RedirectToLogin />

  /*
   * Refused where they stand, not redirected.
   *
   * A signed-in client has already satisfied the login page, so sending them back to it would
   * either loop — guard refuses, login sees a session, login returns them, guard refuses — or
   * leave them on a form with nothing to fill in and no idea why. A plain sentence is the
   * honest answer, and the address stays in the bar so what they pasted is still visible.
   */
  if (!isAdmin) {
    // "Admins", because that is the word GLOSSARY.md uses for them — it lists staff, manager
    // and owner as the synonyms to avoid, and the spec is explicit that the frontend invents
    // no vocabulary of its own.
    return (
      <EmptyState title="This part is for salon admins">
        Your account is a client account, so the salon's own pages are not open to you. Your
        appointments are under My bookings.
      </EmptyState>
    )
  }

  return <Outlet />
}
