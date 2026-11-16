import type { ReactNode } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import type { Service, Stylist } from '../api/dto'
import {
  address,
  houseNotes,
  openLabel,
  openStateAt,
  shop,
  week,
  weekdayAt,
} from '../brand/house'
import { servicesQuery, stylistsQuery } from '../catalogue/catalogue'
import { ServiceIcon } from '../catalogue/serviceIcon'
import { messageFor } from '../lib/errorCopy'
import { formatDuration, formatMoney, nowWallClock } from '../lib/wallClock'
import { buttonClass } from '../ui/buttonClass'
import { EmptyState } from '../ui/EmptyState'
import { ChairIcon, ClockIcon, PhoneIcon, PinIcon, StarIcon } from '../ui/icons'

/**
 * The menu: the landing page, and the first thing a reviewer opens.
 *
 * The **menu**, not the catalogue — `GET /api/services` answers a client with the active
 * services only, so this screen is handed exactly what a client may choose from and filters
 * nothing itself (see `catalogue/catalogue.ts`).
 *
 * It is also the only page with a shopfront to keep. A booking page can be plain; a landing
 * page that says nothing but "choose a service" could belong to any trade in the world, so
 * this one carries the things a shop's page is actually asked for — whether it is open now,
 * when it opens, where it is, the number to ring, who is in the chairs, and what the house
 * expects of you. The facts come from `brand/house.ts`, not from markup, and the hours there
 * are a *mirror* of the API's configuration: they decide what is said, never what is offered.
 *
 * Designed at 390px and scaled up, because most of a salon's traffic is someone on a phone.
 * Each service is one tap, and that tap carries the choice into `/book` through the URL, so
 * arriving at the booking page from here means one of its three controls is already answered.
 */

/**
 * A line of small capitals over a heading. Brass, tracked out, and the one typographic trick
 * in the application — it is what a shop's signwriting does, and it does the work that a
 * second paragraph of copy would otherwise have to.
 */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-accent-ink uppercase">
      {children}
    </p>
  )
}

/** Open or shut, as a pill. Green when the door is open, muted brass when it is not. */
function OpenSign() {
  // Read once, here: the sign and the hours list below it must agree about what day it is.
  const now = nowWallClock()
  const state = openStateAt(now)

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
        state.open ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-soft',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'size-2 rounded-full',
          state.open ? 'bg-success' : 'bg-line-strong',
        ].join(' ')}
      />
      {openLabel(state)}
    </span>
  )
}

/**
 * One service, as a line on a price list.
 *
 * The icon is a guess made from the name (`catalogue/serviceIcon.ts`) and is decoration: it
 * is `aria-hidden`, and the name beside it is what a visitor reads. The dotted leader between
 * the name and the price is the detail that makes six services read as a menu rather than as
 * rows in a table.
 */
function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to={`/book?serviceId=${service.id}`}
      className="group flex min-h-24 items-start gap-4 rounded-panel border border-line bg-surface p-4 transition-colors hover:border-primary hover:bg-primary-soft/40"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-accent-soft text-accent-ink transition-colors group-hover:border-accent">
        <ServiceIcon name={service.name} className="size-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xl leading-tight font-semibold text-ink">
            {service.name}
          </h3>
          <span aria-hidden className="leader" />
          <span className="font-medium tabular-nums text-primary">
            {formatMoney(service.price)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-ink-soft">
          <ClockIcon className="size-4 text-ink-faint" />
          <span>{formatDuration(service.durationMinutes)}</span>
          <span className="ml-auto text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Pick a time →
          </span>
        </div>
      </div>
    </Link>
  )
}

/** Cards the shape of the real ones, so the page does not jump when the answer arrives. */
function MenuSkeleton() {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="min-h-24 animate-pulse rounded-panel border border-line bg-surface-sunken/60"
        />
      ))}
    </div>
  )
}

/**
 * Initials for the circle beside a stylist's name — one letter per word, at most two.
 *
 * A photograph would be better and there is nowhere to put one: a stylist is `{ id, name,
 * isActive }` and nothing more. Initials are what is left, and they are honest about being a
 * stand-in rather than pretending to be a portrait.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0].toLocaleUpperCase())
    .join('')
}

/** One stylist, as a chair you can walk up to. The link carries them into `/book`. */
function ChairCard({ stylist }: { stylist: Stylist }) {
  return (
    <Link
      to={`/book?stylistId=${stylist.id}`}
      className="group flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3 transition-colors hover:border-primary hover:bg-primary-soft/40"
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white"
      >
        {initialsOf(stylist.name)}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-ink">{stylist.name}</span>
        <span className="text-xs text-ink-faint group-hover:text-primary">See times</span>
      </span>
    </Link>
  )
}

export function MenuPage() {
  const menu = useQuery(servicesQuery())

  /*
   * The stylists, for the chairs. The same anonymous `GET /api/stylists` the booking page
   * uses, so this costs the visitor nothing they were not about to fetch anyway — and if it
   * fails, the section simply is not there. It is an introduction, not a control: the real
   * choice of stylist is on `/book`, and no booking depends on this list having arrived.
   */
  const chairs = useQuery(stylistsQuery())

  const today = weekdayAt(nowWallClock())

  return (
    <div className="flex flex-col gap-10">
      {/* The shopfront. */}
      <section className="overflow-hidden rounded-panel border border-line bg-surface">
        <div className="relative flex flex-col gap-5 px-5 py-7 sm:px-8 sm:py-10">
          <div aria-hidden className="pinstripe pointer-events-none absolute inset-0 opacity-40" />

          <div className="relative flex flex-col gap-4">
            <Eyebrow>
              {shop.kind} · {shop.neighbourhood}
            </Eyebrow>

            <h1 className="max-w-prose font-display text-3xl leading-tight font-semibold text-ink sm:text-5xl">
              A chair, a clean towel, and the time you asked for.
            </h1>

            <p className="max-w-prose text-ink-soft">{shop.tagline}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
              <OpenSign />
              <span className="inline-flex items-center gap-1.5">
                <PinIcon className="size-4 text-accent" />
                {address}
              </span>
              <a
                href={shop.phoneHref}
                className="inline-flex items-center gap-1.5 font-medium text-primary underline"
              >
                <PhoneIcon className="size-4" />
                {shop.phone}
              </a>
            </div>

            {/*
             * The invitation, as an anchor down the page rather than a route: the thing being
             * offered — the list of services — is already here, and a landing page's first
             * button should not navigate away from the decision it is asking for.
             */}
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#menu" className={buttonClass()}>
                Choose a service
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="flex flex-col gap-4 scroll-mt-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>
            <StarIcon className="size-4 text-accent" />
            Prices in dinars, the finish included
          </Eyebrow>
          <h2 className="font-display text-2xl font-semibold text-ink">The menu</h2>
        </div>

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

      {/*
       * The chairs. Only when there are some: an empty or failed list means the section is
       * not rendered at all, because "who is in today" is worth nothing as an empty box.
       */}
      {chairs.isSuccess && chairs.data.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>
              <ChairIcon className="size-4 text-accent" />
              Whoever is free, or whoever you always ask for
            </Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-ink">The chairs</h2>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {chairs.data.map((stylist) => (
              <li key={stylist.id}>
                <ChairCard stylist={stylist} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The shop itself: the hours, the door, and what the house expects. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>
            <ClockIcon className="size-4 text-accent" />
            Open six days
          </Eyebrow>
          <h2 className="font-display text-2xl font-semibold text-ink">The shop</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
            <h3 className="font-display text-lg font-semibold text-ink">Hours</h3>

            {/*
             * Every day listed, shut one included, with today's line marked — the question
             * somebody opens this card with is almost always about today.
             */}
            <dl className="flex flex-col">
              {week.map((day) => {
                const isToday = day.weekday === today
                return (
                  <div
                    key={day.weekday}
                    className={[
                      'flex justify-between gap-3 border-b border-line py-1.5 last:border-b-0 text-sm',
                      isToday ? 'font-medium text-ink' : 'text-ink-soft',
                    ].join(' ')}
                  >
                    <dt className="flex items-center gap-2">
                      {day.weekday}
                      {isToday && (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-accent-ink uppercase">
                          Today
                        </span>
                      )}
                    </dt>
                    <dd className="tabular-nums">
                      {day.hours === undefined
                        ? 'Closed'
                        : `${day.hours.open}–${day.hours.close}`}
                    </dd>
                  </div>
                )
              })}
            </dl>

            <p className="text-xs text-ink-faint">
              The last appointment of the day is one that finishes before we close.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
            <h3 className="font-display text-lg font-semibold text-ink">The house</h3>

            <ul className="flex flex-col gap-3">
              {houseNotes.map((note) => (
                <li key={note.title} className="flex gap-3">
                  <StarIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-ink">{note.title}</span>
                    <span className="text-sm text-ink-soft">{note.body}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div aria-hidden className="brass-rule h-px" />

            <p className="flex items-start gap-2 text-sm text-ink-soft">
              <PinIcon className="mt-0.5 size-4 shrink-0 text-accent" />
              {address}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
