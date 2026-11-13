import { NavLink, Outlet } from 'react-router-dom'

/**
 * The shell both sides of the application share.
 *
 * It is role-aware by design — `AuthResponse` carries `user.role`, so nothing here ever
 * decodes the JWT to decide what to render — but the session itself arrives in issue 04. Until
 * then the navigation shows only the public links.
 */

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-soft text-primary' : 'text-ink-soft hover:bg-surface-sunken',
  ].join(' ')

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        {/* 16px gutter, mobile first, and never a horizontal page scroll. */}
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <NavLink to="/" className="font-display text-2xl text-primary">
            Salon
          </NavLink>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Menu
            </NavLink>
            <NavLink to="/book" className={linkClass}>
              Book
            </NavLink>
            <NavLink to="/bookings" className={linkClass}>
              My bookings
            </NavLink>
            <NavLink to="/login" className={linkClass}>
              Sign in
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-faint">
        Times shown are salon local time.
      </footer>
    </div>
  )
}
