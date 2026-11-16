import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import type { Booking } from '../api/dto'
import { myBookingsQuery } from '../booking/bookingApi'
import { cancelOffer, groupByWhen, type CancelOffer } from '../booking/myBookings'
import { useCancelBooking } from '../booking/useCancelBooking'
import { ServiceIcon } from '../catalogue/serviceIcon'
import { copyForCode, messageFor } from '../lib/errorCopy'
import {
  formatDate,
  formatMoney,
  formatRange,
  formatWeekday,
  nowWallClock,
} from '../lib/wallClock'
import { StatusBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'

/**
 * A client's own bookings.
 *
 * Two lists and one action, and both of the interesting things on it are decisions made
 * elsewhere becoming visible here. Every row shows the **snapshotted** service name and price
 * — what was agreed — rather than the catalogue's current values, which is ADR-0003 as a
 * client experiences it.
 *
 * Mobile-first: a card per booking rather than a table. The admin's bookings screen is the
 * one that earns a table; here there are at most a handful of rows and the client is on a
 * phone.
 */

export function MyBookingsPage() {
  const bookings = useQuery(myBookingsQuery())
  const cancelling = useCancelBooking()

  // Read once per render, so both groups and every row's deadline are judged against the same
  // moment. See `wallClock.ts`: this is the browser's approximation of the salon's clock, and
  // it is only ever used to decide what to *offer*.
  const now = nowWallClock()

  const mine = bookings.data ?? []
  const groups = groupByWhen(mine, now)

  /*
   * Each booking paired with what is left to do about it, decided once here.
   *
   * It is paired at this level so that `now` does not have to travel down through two
   * components to be re-asked per row: the groups and the deadlines are then provably judged
   * against the same moment, which is the whole reason the page reads the clock once.
   */
  const withOffer = (rows: readonly Booking[]): readonly Row[] =>
    rows.map((booking) => ({ booking, offer: cancelOffer(booking, now) }))

  /*
   * The booking the confirmation is about, taken from the current data rather than remembered.
   *
   * The question names a time and a stylist, so if the list refetched underneath an open
   * dialog, a remembered copy would go on asking about the booking as it used to be. The
   * dialog's own open-ness is kept on the id instead — if the row vanishes from the list while
   * a request is in flight, the dialog has to stay up to show the answer, and it is only the
   * line naming the appointment that goes.
   */
  const beingCancelled = mine.find((row) => row.id === cancelling.asking)

  return (
    <div className="flex flex-col gap-8">
      {/*
       * The heading renders whatever the query is doing. It is the page's identity, not part of
       * its answer, and flashing it in once the request lands would make the one thing that
       * tells a visitor where they are the last thing to arrive.
       */}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold text-ink">My bookings</h1>
        <p className="text-sm text-ink-soft">
          What you have booked, and what you have had done.
        </p>
      </header>

      {bookings.isPending && (
        <p role="status" className="text-sm text-ink-soft">
          Fetching your bookings…
        </p>
      )}

      {bookings.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(bookings.error)}
        </p>
      )}

      {bookings.isSuccess && mine.length === 0 && (
        <EmptyState
          title="Nothing booked yet"
          action={
            // The **menu**, not `/book`: the menu is the active services a client may choose
            // from (`GLOSSARY.md`), it is the landing page, and picking a service there carries
            // that choice into the booking page with one of its three controls already
            // answered. Sending someone with nothing booked to three empty controls instead
            // would be starting them one step further back.
            <Link to="/" className={buttonClass()}>
              See the menu
            </Link>
          }
        >
          When you book an appointment it will appear here, with everything you need to call it
          off again.
        </EmptyState>
      )}

      {bookings.isSuccess && mine.length > 0 && (
        <>
          <Group
            name="Upcoming"
            rows={withOffer(groups.upcoming)}
            empty="Nothing booked at the moment."
            onCancel={cancelling.ask}
          />
          <Group
            name="Past"
            rows={withOffer(groups.past)}
            empty="Nothing yet."
            onCancel={cancelling.ask}
          />
        </>
      )}

      <ConfirmDialog
        open={cancelling.asking !== undefined}
        onOpenChange={(open) => !open && cancelling.dismiss()}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel it"
        tone="danger"
        pending={cancelling.isPending}
        error={cancelling.error}
        onConfirm={cancelling.confirm}
      >
        {beingCancelled !== undefined && (
          <p>
            {beingCancelled.serviceName} with {beingCancelled.stylistName},{' '}
            {formatWeekday(beingCancelled.start)} {formatDate(beingCancelled.start)} at{' '}
            {formatRange(beingCancelled.start, beingCancelled.end)}.
          </p>
        )}

        {/*
         * Said plainly rather than as "this cannot be undone": it cannot, but what a client
         * actually needs to know is that the hour goes back on offer and getting it again is
         * not guaranteed. A slot is an offer, not a hold, in this direction too.
         */}
        <p>
          The time goes back on offer to other clients, so you may not be able to take it again.
          Rebooking is one tap away either way.
        </p>
      </ConfirmDialog>
    </div>
  )
}

/**
 * One of the two groups.
 *
 * Headed and labelled as a region, which is what lets the two be told apart — by a screen
 * reader navigating the page, and by the tests making claims about which list a booking ended
 * up in. An empty group still renders its heading: "Past: nothing yet" is information, and a
 * group that vanished would make the remaining one ambiguous.
 */
function Group({
  name,
  rows,
  empty,
  onCancel,
}: {
  name: string
  rows: readonly Row[]
  empty: string
  onCancel: (bookingId: number) => void
}) {
  return (
    <section aria-label={name} className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-ink">{name}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ booking, offer }) => (
            <li key={booking.id}>
              <BookingCard booking={booking} offer={offer} onCancel={onCancel} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The drawing beside a service's name, guessed from that name the way the menu guesses it.
 *
 * From the booking's own `serviceName` — the snapshot, not the catalogue — so a row keeps the
 * icon matching what was agreed even if the service has been renamed since (ADR-0003).
 */
function ServiceMark({ name }: { name: string }) {
  return <ServiceIcon name={name} className="size-4 shrink-0 text-accent" />
}

/** One booking, and what `myBookings.ts` says is left to do about it. */
interface Row {
  booking: Booking
  offer: CancelOffer
}

/**
 * One booking as a card.
 *
 * `offered` is the only case with a button. A booking inside the deadline shows a line saying
 * so, rather than a disabled button a client has to hover to understand — and rather than
 * nothing, which would leave them wondering where the action went. `none` shows neither: there
 * is no action and nothing worth explaining.
 */
function BookingCard({
  booking,
  offer,
  onCancel,
}: {
  booking: Booking
  offer: CancelOffer
  onCancel: (bookingId: number) => void
}) {
  return (
    <article
      className={[
        'flex flex-col gap-3 rounded-panel border border-line bg-surface p-4',
        'sm:flex-row sm:items-center sm:justify-between',
        booking.status === 'Cancelled' ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-ink">
          {/*
           * The same guess the menu makes, from the name the booking itself carries — so a
           * client recognises last month's appointment by its drawing before they have read
           * the line. Decoration, and hidden from a screen reader: the name is right there.
           */}
          <ServiceMark name={booking.serviceName} />
          {/*
           * The booking's own name and price, not the catalogue's. ADR-0003: a booking records
           * what was agreed, so a service renamed or re-priced since does not rewrite it.
           */}
          <span className="font-medium">{booking.serviceName}</span>
          <StatusBadge status={booking.status} />
        </p>

        <p className="text-sm text-ink-soft">
          {formatWeekday(booking.start)} {formatDate(booking.start)},{' '}
          <span className="tabular-nums">{formatRange(booking.start, booking.end)}</span> with{' '}
          {booking.stylistName}
        </p>

        <p className="text-sm text-ink-soft tabular-nums">{formatMoney(booking.price)}</p>
      </div>

      {offer === 'offered' && (
        <Button variant="danger" size="sm" onClick={() => onCancel(booking.id)}>
          Cancel booking
        </Button>
      )}

      {/*
       * The refusal's own words, reached rather than retyped.
       *
       * This is exactly what `copyForCode` is for: the screen knows the deadline has passed
       * without having been refused, and the sentence has to be the one the refusal would have
       * used. Writing it out here is how two phrasings of one rule get into the application.
       */}
      {offer === 'too-late' && (
        <p className="max-w-64 text-xs text-ink-faint">
          {copyForCode('cancellation_too_late').message}
        </p>
      )}
    </article>
  )
}
