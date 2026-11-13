import { AuthProvider } from '../auth/AuthProvider'
import { AppShell } from './AppShell'

/**
 * The root layout: the session, then the shell.
 *
 * The session lives *inside* the router because it navigates — a guard redirects, and a `401`
 * sends the visitor back to login — so it wraps the shell rather than the router.
 */
export function AppRoot() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
