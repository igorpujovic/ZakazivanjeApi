import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { address, openLabel, openStateAt, shop, weekRuns } from '../brand/house'
import { useAuth } from '../auth/authContext'
import { loginPathFor } from '../auth/returnTo'
import { nowWallClock } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { ClockIcon, PhoneIcon, PinIcon } from '../ui/icons'
import { Wordmark } from '../ui/Logo'

/**
 * The shell both sides of the application share.
 *
 * Role-aware, from `user.role` on the session — which came out of `AuthResponse`, because the
 * API puts it there precisely so a frontend never has to decode a JWT to decide what to
 * render. A client is offered the menu and their own bookings; an admin is offered the day's
 * bookings and the catalogue.
 */

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-soft text-primary' : 'text-ink-soft hover:bg-surface-sunken',
  ].join(' ')

export function AppShell() {
  const { user, isAdmin, expiryWarningMinutes, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /*
   * Three audiences, named rather than inferred from one another: a visitor with no session, a
   * client, and an admin. `RequireSession` deliberately guards `/book` and `/bookings` on
   * having a session rather than on being a client, so an admin who types one of those
   * addresses is let through — they are simply not offered a link to it, because an admin
   * booking themselves in is not something the salon does.
   */
  const isClient = user !== undefined && !isAdmin

  const onSignOut = () => {
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        {/* 16px gutter, mobile first, and never a horizontal page scroll. */}
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <NavLink to="/" aria-label={`${shop.name} — home`} className="shrink-0">
            <Wordmark />
          </NavLink>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Menu
            </NavLink>

            {/*
             * Book is offered to a visitor as well as a client: the guard sends them to sign
             * in and `returnTo` brings them straight back, which is a better invitation than
             * hiding the thing the salon is here for. My bookings is not — there is nothing
             * behind it until they have an account.
             */}
            {!isAdmin && (
              <NavLink to="/book" className={linkClass}>
                Book
              </NavLink>
            )}

            {isClient && (
              <NavLink to="/bookings" className={linkClass}>
                My bookings
              </NavLink>
            )}

            {isAdmin && (
              <>
                <NavLink to="/admin/bookings" className={linkClass}>
                  All bookings
                </NavLink>

                {/*
                 * "Catalogue", not "Menu": the catalogue is services *and* stylists, active or
                 * not, as an admin curates them — the menu is what a client is offered. The
                 * glossary keeps the two apart and so does this navigation.
                 */}
                <span className="px-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  Catalogue
                </span>
                <NavLink to="/admin/services" className={linkClass}>
                  Services
                </NavLink>
                <NavLink to="/admin/stylists" className={linkClass}>
                  Stylists
                </NavLink>
              </>
            )}

            {user === undefined ? (
              <NavLink to={loginPathFor(location)} className={linkClass}>
                Sign in
              </NavLink>
            ) : (
              <Button variant="ghost" size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/*
       * The pole, unrolled. One rule, right under the sign, and the page has said what kind of
       * shop it is before any copy has been read. Decoration with no information in it, so it
       * is `aria-hidden` and keeps out of the document for anyone reading by ear.
       */}
      <div aria-hidden className="pole-rule h-1.5" />

      {/* The five-minute warning. Notice is all there is to offer — see `auth/session.ts`. */}
      {expiryWarningMinutes !== undefined && (
        <p
          role="status"
          className="border-b border-accent/30 bg-accent-soft px-4 py-2 text-center text-sm text-ink"
        >
          You will be signed out in {expiryWarningMinutes}{' '}
          {expiryWarningMinutes === 1 ? 'minute' : 'minutes'}. Finish what you are doing, then
          sign in again.
        </p>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      {/*
       * The bottom of a shop's page, with the three things somebody scrolls down looking for:
       * when it is open, where it is, and the number to ring. All of it from
       * `brand/house.ts` — the hours collapsed into runs there rather than written out here,
       * so the footer cannot end up claiming different hours from the shop card on the menu.
       */}
      <footer className="mt-10 border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="font-display text-lg font-semibold tracking-wide text-primary uppercase">
              {shop.name}
            </p>
            <p className="text-sm text-ink-soft">{shop.tagline}</p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">
              <ClockIcon className="size-4 text-accent" />
              Hours
            </h2>
            <dl className="flex flex-col gap-1 text-sm text-ink-soft">
              {weekRuns.map((run) => (
                <div key={run.from} className="flex justify-between gap-3">
                  <dt>{run.from === run.to ? run.from : `${run.from}–${run.to}`}</dt>
                  <dd className="tabular-nums">
                    {run.hours === undefined
                      ? 'Closed'
                      : `${run.hours.open}–${run.hours.close}`}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-faint">{openLabel(openStateAt(nowWallClock()))}</p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">
              <PinIcon className="size-4 text-accent" />
              Find us
            </h2>
            <p className="text-sm text-ink-soft">{address}</p>
            <a
              href={shop.phoneHref}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"
            >
              <PhoneIcon className="size-4" />
              {shop.phone}
            </a>
          </div>
        </div>

        <p className="border-t border-line px-4 py-4 text-center text-xs text-ink-faint">
          Times shown are salon local time.
        </p>
      </footer>
    </div>
  )
}
