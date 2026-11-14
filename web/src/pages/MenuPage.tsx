import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import type { Service } from '../api/dto'
import { servicesQuery } from '../catalogue/catalogue'
import { messageFor } from '../lib/errorCopy'
import { formatDuration, formatMoney } from '../lib/wallClock'
import { EmptyState } from '../ui/EmptyState'

/**
 * The menu: the landing page, and the first thing a reviewer opens.
 *
 * The **menu**, not the catalogue — `GET /api/services` answers a client with the active
 * services only, so this screen is handed exactly what a client may choose from and filters
 * nothing itself (see `catalogue/catalogue.ts`).
 *
 * Designed at 390px and scaled up, because most of a salon's traffic is someone on a phone.
 * Each service is one tap, and that tap carries the choice into `/book` through the URL, so
 * arriving at the booking page from here means one of its three controls is already answered.
 */

function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to={`/book?serviceId=${service.id}`}
      className="group flex min-h-24 flex-col justify-between gap-3 rounded-panel border border-line bg-surface p-4 transition-colors hover:border-primary hover:bg-primary-soft/40"
    >
      <h3 className="font-display text-xl leading-tight text-ink">{service.name}</h3>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">{formatDuration(service.durationMinutes)}</span>
        <span className="font-medium tabular-nums text-primary">
          {formatMoney(service.price)}
        </span>
      </div>
    </Link>
  )
}

/** Cards the shape of the real ones, so the page does not jump when the answer arrives. */
function MenuSkeleton() {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="min-h-24 animate-pulse rounded-panel border border-line bg-surface-sunken/60" />
      ))}
    </div>
  )
}

export function MenuPage() {
  const menu = useQuery(servicesQuery())

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
          Book your next appointment
        </h1>
        <p className="max-w-prose text-ink-soft">
          Choose what you are coming in for. You will pick a stylist, a day and a time next —
          nothing is held until you confirm.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">The menu</h2>

        {menu.isPending && (
          <>
            <p role="status" className="sr-only">
              Loading the menu.
            </p>
            <MenuSkeleton />
          </>
        )}

        {menu.isError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            {messageFor(menu.error)}
          </p>
        )}

        {/*
         * Empty is an answer, not a failure: a salon that has not filled in its services yet
         * has nothing on the menu, and saying so is more use than an error nobody can act on.
         */}
        {menu.isSuccess && menu.data.length === 0 && (
          <EmptyState title="Nothing on the menu yet">
            The salon has not published its services. Please check back, or call to ask.
          </EmptyState>
        )}

        {menu.isSuccess && menu.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {menu.data.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
