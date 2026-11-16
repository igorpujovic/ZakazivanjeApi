import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  ALL_DAYS,
  canCancel,
  completeOffer,
  filtersFrom,
  pageView,
  searchFor,
  type AdminFilters,
  type CompleteOffer,
  type PageView,
} from '../admin/adminBookings'
import { adminBookingsQuery } from '../admin/adminBookingsApi'
import {
  useAdminBookingActions,
  type AdminBookingActions,
} from '../admin/useAdminBookingActions'
import type { Booking, Stylist } from '../api/dto'
import { asChosenDate } from '../booking/selection'
import { stylistsQuery } from '../catalogue/catalogue'
import { copyForCode, messageFor } from '../lib/errorCopy'
import {
  addDays,
  formatDate,
  formatMoney,
  formatRange,
  formatWeekday,
  nowWallClock,
  todayWallClockDate,
  type WallClock,
  type WallClockDate,
} from '../lib/wallClock'
import { StatusBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { Select } from '../ui/Select'
import { Td, Th, TableFrame, Tr } from '../ui/Table'

/**
 * `/admin/bookings`: the receptionist's screen.
 *
 * The only caller of the one paginated endpoint in the API, and the screen whose defaults
 * matter most. `GET /api/bookings` orders by `Start` then `Id` ascending, so a page that asked
 * it nothing would open on the oldest bookings in salon history — this one opens on today, and
 * the day lives in the address so prev/next move history along with the screen.
 *
 * Three absences are deliberate. There is **no status filter**, because the endpoint has none
 * and dropping cancelled rows from a page of twenty would make "20 of 143" a lie — a day's
 * cancelled bookings are arguably what a receptionist most needs to see, being freed time.
 * There is **no second call** for who booked, `BookingResponse` already carrying `clientName`.
 * And there is **no phone layout**: the table is seven columns plus two actions, a receptionist
 * uses a keyboard, and `TableFrame`'s honest horizontal scroll beats cards pretending a table
 * was a mistake.
 *
 * The arithmetic — which day a bare address means, which rows a page covers, what is left to do
 * about a row — is in `admin/adminBookings.ts`, so none of it is decided while rendering.
 */

/** Radix reserves the empty string, so the whole salon is a named value rather than an absent one. */
const EVERY_STYLIST = 'everyone'

export function AdminBookingsPage() {
  const [params, setParams] = useSearchParams()

  const today = todayWallClockDate()
  const filters = filtersFrom(params.toString(), today)

  /*
   * Inactive stylists included, which is the admin's view of the catalogue (ADR-0012) and the
   * right one here: a retired stylist keeps every booking they ever had, and a filter that
   * could not name them would make those days unfilterable.
   */
  const stylists = useQuery(stylistsQuery(true))
  const bookings = useQuery(adminBookingsQuery(filters))

  const actions = useAdminBookingActions()

  /*
   * Read once per render, so every row's Complete button is judged against the same moment.
   * See `wallClock.ts`: this is the browser's approximation of the salon's clock, and it is
   * only ever used to decide what to *offer*.
   */
  const now = nowWallClock()

  const wholeHistory = filters.day === ALL_DAYS

  /**
   * Any change of filter, with the page reset.
   *
   * A day's page four has nothing to do with the next day's, and leaving the page behind is how
   * a receptionist clicking Next day lands on an empty screen. Paging passes its own `page`,
   * which wins over the reset.
   */
  const go = (patch: Partial<AdminFilters>) =>
    setParams(searchFor({ ...filters, page: 1, ...patch }))

  const rows = bookings.data?.items ?? []
  const view = bookings.data === undefined ? undefined : pageView(bookings.data)

  /*
   * The booking the confirmation is about, taken from the current data rather than remembered:
   * the question names a client and a time, so a remembered copy would go on asking about the
   * booking as it used to be if the table refetched underneath an open dialog.
   */
  const beingCancelled = rows.find((row) => row.id === actions.asking)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold text-ink">All bookings</h1>
        <p className="text-sm text-ink-soft">
          Every booking the salon has taken. Cancelled and completed ones stay in the day — a
          freed hour is worth seeing.
        </p>
      </header>

      <Filters
        filters={filters}
        today={today}
        stylists={stylists.data}
        wholeHistory={wholeHistory}
        onChange={go}
      />

      {/*
       * The whole-history view, said out loud. The endpoint answers oldest-first when given no
       * day, so a receptionist who cleared the date is looking at 2019 — which has to read as
       * the view they asked for rather than as a screen that lost today.
       */}
      {wholeHistory && (
        <p className="rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary">
          Showing every booking the salon has ever taken, oldest first.
        </p>
      )}

      {actions.completeError !== undefined && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {actions.completeError}
        </p>
      )}

      {bookings.isPending && (
        <p role="status" className="text-sm text-ink-soft">
          Fetching bookings…
        </p>
      )}

      {bookings.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(bookings.error)}
        </p>
      )}

      {view !== undefined && rows.length === 0 && (
        <EmptyState title={wholeHistory ? 'Nothing to show' : 'Nothing booked'}>
          {view.totalCount === 0
            ? wholeHistory
              ? 'The salon has not taken a booking yet.'
              : 'No bookings on this day. Try another day, or clear the date to see every booking.'
            : /*
               * A page past the end, which only a typed or pasted address reaches. The counts
               * are the footer's business — and the footer renders below, because the way back
               * is the one useful thing left to offer.
               */
              'That page is past the end. Go back to the bookings there are.'}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <TableFrame>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Client</Th>
              <Th>Stylist</Th>
              <Th>Service</Th>
              <Th align="right">Price</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <BookingRow
                key={row.id}
                booking={row}
                now={now}
                showDate={wholeHistory}
                actions={actions}
              />
            ))}
          </tbody>
        </TableFrame>
      )}

      {/*
       * Shown for an empty page too, as long as there is a page before it: a pasted `?page=99`
       * lands on nothing, and a screen offering no way back would leave a receptionist editing
       * the address to escape.
       */}
      {view !== undefined && (rows.length > 0 || view.previous !== undefined) && (
        <Pages view={view} onPage={(page) => go({ page })} />
      )}

      <ConfirmDialog
        open={actions.asking !== undefined}
        onOpenChange={(open) => !open && actions.dismissCancel()}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel it"
        tone="danger"
        pending={actions.cancellingId !== undefined}
        error={actions.cancelError}
        onConfirm={actions.confirmCancel}
      >
        {beingCancelled !== undefined && (
          <p>
            {beingCancelled.serviceName} for {beingCancelled.clientName} with{' '}
            {beingCancelled.stylistName}, {formatWeekday(beingCancelled.start)}{' '}
            {formatDate(beingCancelled.start)} at{' '}
            {formatRange(beingCancelled.start, beingCancelled.end)}.
          </p>
        )}

        {/*
         * Said as what it is, because an admin cancelling somebody else's booking has no undo
         * and the salon is the one who has to tell them. The hour going back on offer is the
         * other half: a cancelled booking releases the stylist's time (ADR-0004).
         */}
        <p>
          The client is not told by the system, so somebody will need to ring them. The hour goes
          back on offer to other clients.
        </p>
      </ConfirmDialog>
    </div>
  )
}

/**
 * The day, the stylist, and the way out to the whole history.
 *
 * Prev and next sit either side of the date input, which is where a receptionist's eye and
 * cursor already are. Both are disabled in the whole-history view, there being no day to move.
 */
function Filters({
  filters,
  today,
  stylists,
  wholeHistory,
  onChange,
}: {
  filters: AdminFilters
  today: WallClockDate
  stylists: readonly Stylist[] | undefined
  wholeHistory: boolean
  onChange: (patch: Partial<AdminFilters>) => void
}) {
  const day = filters.day === ALL_DAYS ? undefined : filters.day

  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex items-end gap-2">
        <Button
          variant="secondary"
          onClick={() => day !== undefined && onChange({ day: addDays(day, -1) })}
          disabled={wholeHistory}
        >
          <span aria-hidden="true">←</span>
          <span className="sr-only">Previous day</span>
        </Button>

        <Field
          label="Day"
          type="date"
          value={day ?? ''}
          /*
           * An emptied date input falls back to today rather than to the whole history. Clearing
           * it with a keyboard is easy to do by accident, and the whole-history view has its own
           * button saying what it is — a filter that landed somebody in 2019 by a stray
           * backspace would be the "broken default" the ticket is guarding against.
           */
          onChange={(event) => onChange({ day: asChosenDate(event.target.value) ?? today })}
        />

        <Button
          variant="secondary"
          onClick={() => day !== undefined && onChange({ day: addDays(day, 1) })}
          disabled={wholeHistory}
        >
          <span aria-hidden="true">→</span>
          <span className="sr-only">Next day</span>
        </Button>
      </div>

      <Select
        label="Stylist"
        value={filters.stylistId === undefined ? EVERY_STYLIST : String(filters.stylistId)}
        onValueChange={(value) =>
          onChange({
            stylistId: value === EVERY_STYLIST ? undefined : Number(value),
          })
        }
        options={[
          { value: EVERY_STYLIST, label: 'Everyone' },
          ...(stylists ?? []).map((stylist) => ({
            value: String(stylist.id),
            // A retired stylist is still named, because their old bookings are still here.
            label: stylist.isActive ? stylist.name : `${stylist.name} (inactive)`,
          })),
        ]}
      />

      {/*
       * The escape hatch, labelled as the view it opens rather than as "clear". A button saying
       * "Clear date" invites being read as a reset to the default, which is the one thing this
       * is not.
       */}
      <Button
        variant="ghost"
        onClick={() => onChange({ day: wholeHistory ? today : ALL_DAYS })}
      >
        {wholeHistory ? 'Back to today' : 'Show every booking ever'}
      </Button>
    </div>
  )
}

/** One booking. Seven columns, and whatever is left to do about it. */
function BookingRow({
  booking,
  now,
  showDate,
  actions,
}: {
  booking: Booking
  now: WallClock
  showDate: boolean
  actions: AdminBookingActions
}) {
  const cancelled = booking.status === 'Cancelled'

  return (
    <Tr dimmed={cancelled}>
      <Td>
        <span className="tabular-nums whitespace-nowrap">
          {formatRange(booking.start, booking.end)}
        </span>
        {/*
         * The date, only in the whole-history view. On a day's page it is in the controls above
         * and would be the same on every row; across the whole history a bare "09:00–10:00"
         * would not say which year.
         */}
        {showDate && (
          <span className="block text-xs whitespace-nowrap text-ink-faint">
            {formatDate(booking.start)}
          </span>
        )}
      </Td>

      {/* `clientId` and `clientName` come with the booking, so there is no second call to make. */}
      <Td>{booking.clientName}</Td>
      <Td>{booking.stylistName}</Td>

      {/* The booking's own service name and price: what was agreed, not the catalogue's now (ADR-0003). */}
      <Td>{booking.serviceName}</Td>
      <Td align="right">
        <span className="tabular-nums">{formatMoney(booking.price)}</span>
      </Td>

      <Td>
        <StatusBadge status={booking.status} />
      </Td>

      <Td>
        <div className="flex items-center gap-2">
          <CompleteButton
            offer={completeOffer(booking, now)}
            pending={actions.completingId === booking.id}
            onComplete={() => actions.complete(booking.id)}
          />

          {canCancel(booking) && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => actions.askCancel(booking.id)}
            >
              Cancel
            </Button>
          )}
        </div>
      </Td>
    </Tr>
  )
}

/**
 * Complete, and the one state where it is offered without being available.
 *
 * `not-started` is rendered `aria-disabled` rather than `disabled`, which is the difference
 * between an explanation a receptionist can reach and one they cannot: a `disabled` button
 * leaves the tab order, so the sentence saying why would be unreachable by keyboard and
 * unannounced by a screen reader. It stays focusable, describable and hoverable, and simply has
 * nothing wired to it — so the request the API would refuse with `booking_not_started` is never
 * sent.
 *
 * The sentence itself is `copyForCode`'s, not this file's: the screen knows the booking has not
 * started without having been refused, and the words have to be the ones the refusal would have
 * used.
 */
function CompleteButton({
  offer,
  pending,
  onComplete,
}: {
  offer: CompleteOffer
  pending: boolean
  onComplete: () => void
}) {
  const whyId = useId()

  if (offer === 'none') return null

  if (offer === 'offered') {
    return (
      <Button size="sm" disabled={pending} onClick={onComplete}>
        {pending ? 'Working…' : 'Complete'}
      </Button>
    )
  }

  const why = copyForCode('booking_not_started').message

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-disabled="true"
        aria-describedby={whyId}
        title={why}
        className="cursor-not-allowed opacity-55"
      >
        Complete
      </Button>
      <span id={whyId} className="sr-only">
        {why}
      </span>
    </>
  )
}

/**
 * The footer: what is on screen, and the way to the rest.
 *
 * Every number comes from the response (`pageView`), never from what was asked for — the API
 * caps `PageSize` at a hundred rather than refusing it, so the two can differ and only one of
 * them is true.
 */
function Pages({ view, onPage }: { view: PageView; onPage: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-ink-soft tabular-nums">
        {view.summary}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={view.previous === undefined}
          onClick={() => view.previous !== undefined && onPage(view.previous)}
        >
          Previous
        </Button>

        {view.totalPages > 0 && (
          <span className="text-sm whitespace-nowrap text-ink-soft tabular-nums">
            Page {view.page} of {view.totalPages}
          </span>
        )}

        <Button
          variant="secondary"
          size="sm"
          disabled={view.next === undefined}
          onClick={() => view.next !== undefined && onPage(view.next)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
