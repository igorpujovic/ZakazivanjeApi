import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  asChosenDate,
  asChosenId,
  isReadyToShowSlots,
  searchFor,
  selectionFrom,
  type Selection,
} from '../booking/selection'
import type { Slot } from '../booking/slots'
import { useConfirmBooking, type Notice } from '../booking/useConfirmBooking'
import { useSlots } from '../booking/useSlots'
import { servicesQuery, stylistsQuery } from '../catalogue/catalogue'
import { copyForCode, messageFor } from '../lib/errorCopy'
import {
  addMinutes,
  formatDate,
  formatDuration,
  formatMoney,
  formatRange,
  formatWeekday,
  todayWallClockDate,
} from '../lib/wallClock'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { NativeSelect } from '../ui/NativeSelect'
import { SlotGrid } from '../ui/SlotGrid'

/**
 * One page: service, stylist, day, then the grid.
 *
 * Its state is the address bar (`booking/selection.ts`), so a half-made choice is linkable and
 * the back button works without this page implementing history. Its one piece of real
 * cleverness is "No preference", which the API cannot express and `booking/useSlots.ts` closes
 * by asking every stylist at once. Confirming, and the five ways it can be refused, live in
 * `booking/useConfirmBooking.ts`.
 *
 * Mobile-first at 390px: three stacked controls, a wrapping grid of real touch targets, and a
 * confirm step that is deliberately a second tap — booking someone's Saturday by brushing a
 * button with a thumb is not a thing this page should allow.
 */

export function BookPage() {
  const [params, setParams] = useSearchParams()
  const asked = selectionFrom(params.toString())

  const navigate = useNavigate()

  const services = useQuery(servicesQuery())
  const stylists = useQuery(stylistsQuery())

  /*
   * What the address asked for that the salon no longer offers.
   *
   * The same two flags answer a link pasted from a months-old message and a service an admin
   * withdrew while this page sat open, because to a visitor those are the same situation: the
   * thing named in the address is not on the menu.
   */
  const serviceWithdrawn =
    services.isSuccess &&
    asked.serviceId !== undefined &&
    !services.data.some((candidate) => candidate.id === asked.serviceId)

  const stylistWithdrawn =
    stylists.isSuccess &&
    asked.stylistId !== undefined &&
    !stylists.data.some((candidate) => candidate.id === asked.stylistId)

  /*
   * What is actually in force, which is not always what was asked for.
   *
   * A withdrawn stylist falls back to **No preference** rather than to nothing: "whoever is
   * free" is a real answer to "who", so the grid fills with the stylists who remain and an
   * alternative really is one tap away — which is what the ticket asks of the `*_inactive`
   * recoveries. A withdrawn service has no such default, its duration being what the whole
   * grid is computed from, so that one waits for a choice.
   *
   * Every control renders from this and every question is asked with it, so the page cannot
   * show "No preference" while quietly still asking about Ana. The address keeps the original
   * request, which is why the banner explaining it survives a reload, and `choose` rewrites
   * from here, so touching any control drops what is no longer on offer.
   */
  const selection: Selection = {
    serviceId: serviceWithdrawn ? undefined : asked.serviceId,
    stylistId: stylistWithdrawn ? undefined : asked.stylistId,
    date: asked.date,
  }

  const slots = useSlots(selection, stylists.data)

  const [picked, setPicked] = useState<Slot | undefined>(undefined)

  const confirmBooking = useConfirmBooking({ onBooked: () => navigate('/bookings') })

  /*
   * The pick, as far as the screen is concerned.
   *
   * A refusal that cannot be retried has taken the pick with it, so it stops being offered
   * without anyone having to remember to clear it. `booking_contended` is the exception, and
   * holding on to it there is the whole reason a retry needs nothing re-entered.
   */
  const pick =
    confirmBooking.notice !== undefined && !confirmBooking.keepsPick ? undefined : picked

  /** Any change of control invalidates both the pick made under the old one and its notice. */
  const choose = (patch: Partial<Selection>) => {
    setPicked(undefined)
    confirmBooking.dismiss()
    setParams(searchFor({ ...selection, ...patch }))
  }

  /*
   * One notice region, not two.
   *
   * A refusal's own words win over the standing banner, because for the `*_inactive` codes
   * they say the same thing and the refusal's version is the one that arrived in answer to
   * something the visitor just did. The banner takes over once the notice is dismissed by
   * changing a control, and both come from `errorCopy.ts`, so the two cannot drift apart.
   */
  const standing: Notice | undefined = serviceWithdrawn
    ? { message: copyForCode('service_inactive').message, canRetry: false }
    : stylistWithdrawn
      ? {
          message: `${copyForCode('stylist_inactive').message} Until you do, we are showing whoever is free.`,
          canRetry: false,
        }
      : undefined

  const shown = confirmBooking.notice ?? standing

  const chosenService = services.data?.find((candidate) => candidate.id === selection.serviceId)
  const catalogueError = services.error ?? stylists.error

  /*
   * What goes where the grid goes. One value rather than five overlapping conditions in the
   * markup, so the states are visibly exclusive and a new one has somewhere to be added.
   *
   * `finding` covers the catalogue still arriving when the address already named a service and
   * a day: the page has everything it needs to ask and is about to, so inviting the visitor to
   * choose what they have already chosen would be a flicker of nonsense.
   */
  const view: 'choose' | 'finding' | 'failed' | 'empty' | 'offers' | 'nothing' =
    (isReadyToShowSlots(selection) && (services.isPending || stylists.isPending)) ||
    slots.status === 'pending'
      ? 'finding'
      : slots.status === 'error'
        ? 'failed'
        : slots.status === 'idle'
          ? shown === undefined
            ? 'choose'
            : 'nothing'
          : slots.slots.length === 0
            ? 'empty'
            : 'offers'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">Book an appointment</h1>
        <p className="text-sm text-ink-soft">
          Pick what you are coming in for, who with, and when.
        </p>
      </header>

      {catalogueError !== null && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(catalogueError)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <NativeSelect
          label="Service"
          value={selection.serviceId ?? ''}
          onChange={(event) => choose({ serviceId: asChosenId(event.target.value) })}
        >
          <option value="">Choose a service</option>
          {services.data?.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} · {formatDuration(candidate.durationMinutes)} ·{' '}
              {formatMoney(candidate.price)}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          label="Stylist"
          value={selection.stylistId ?? ''}
          hint={selection.stylistId === undefined ? 'We will show whoever is free.' : undefined}
          onChange={(event) => choose({ stylistId: asChosenId(event.target.value) })}
        >
          {/* The default, and the one thing the API cannot answer on its own. */}
          <option value="">No preference</option>
          {stylists.data?.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </NativeSelect>

        <Field
          label="Day"
          type="date"
          /*
           * The browser's own calendar, with `min` at today. An approximation of the salon's
           * today — see `nowWallClock` — and only ever a default: the API refuses a start in
           * the past itself, and this page recovers from that answer like any other.
           */
          min={todayWallClockDate()}
          value={selection.date ?? ''}
          onChange={(event) => choose({ date: asChosenDate(event.target.value) })}
        />
      </div>

      {shown !== undefined && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{shown.message}</p>
          {shown.canRetry && pick !== undefined && chosenService !== undefined && (
            <Button
              variant="secondary"
              size="sm"
              disabled={confirmBooking.isPending}
              onClick={() => confirmBooking.confirm(pick, chosenService.id)}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {view === 'choose' && (
        <p className="text-sm text-ink-soft">
          Choose a service and a day, and the free times will appear here.
        </p>
      )}

      {view === 'finding' && (
        <p role="status" className="text-sm text-ink-soft">
          Finding free times…
        </p>
      )}

      {view === 'failed' && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(slots.error)}
        </p>
      )}

      {slots.unreachable > 0 && (
        <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-ink">
          Some stylists could not be checked just now, so there may be more times free than
          these.
        </p>
      )}

      {/*
       * Empty is an answer: a weekday the salon is closed, a day already over, or a day that is
       * simply full. The API says so in as many words, and rendering it as an error would be
       * telling a visitor something went wrong when nothing did.
       */}
      {view === 'empty' && (
        <EmptyState title="Nothing free that day">
          {chosenService !== undefined && selection.date !== undefined
            ? `No ${formatDuration(chosenService.durationMinutes)} appointment fits on ${formatDate(selection.date)}.`
            : 'Try another day.'}
        </EmptyState>
      )}

      {view === 'offers' && slots.durationMinutes !== undefined && (
        <SlotGrid
          slots={slots.slots}
          durationMinutes={slots.durationMinutes}
          selected={pick?.start}
          onSelect={(slot) => {
            confirmBooking.dismiss()
            setPicked(slot)
          }}
          disabled={confirmBooking.isPending}
          withStylistNames={selection.stylistId === undefined}
        />
      )}

      {/*
       * The second tap. Sticky at the bottom so that on a phone, where the grid can be longer
       * than the screen, the thing you are about to agree to and the button that agrees to it
       * are visible together.
       */}
      {pick !== undefined &&
        chosenService !== undefined &&
        slots.durationMinutes !== undefined && (
          <section
            aria-label="Your pick"
            className="sticky bottom-0 flex flex-col gap-3 rounded-panel border border-line-strong bg-surface p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-ink">
              <span className="font-medium tabular-nums">
                {formatRange(pick.start, addMinutes(pick.start, slots.durationMinutes))}
              </span>{' '}
              with {pick.stylistName}
              {selection.date !== undefined && (
                <>
                  {', '}
                  {formatWeekday(selection.date)} {formatDate(selection.date)}
                </>
              )}
            </p>

            <Button
              disabled={confirmBooking.isPending}
              onClick={() => confirmBooking.confirm(pick, chosenService.id)}
            >
              {confirmBooking.isPending ? 'Confirming…' : 'Confirm booking'}
            </Button>
          </section>
        )}
    </div>
  )
}
