import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { ActivationToggle } from '../catalogue/ActivationToggle'
import { servicesQuery } from '../catalogue/catalogue'
import { serviceAdmin } from '../catalogue/catalogueAdmin'
import { useActivation } from '../catalogue/useActivation'
import { useCatalogueEditor, type CatalogueEditor } from '../catalogue/useCatalogueEditor'
import type { ServiceDraft } from '../catalogue/catalogueDraft'
import { WithdrawalDialog } from '../catalogue/WithdrawalDialog'
import type { Service } from '../api/dto'
import { messageFor } from '../lib/errorCopy'
import { limits } from '../lib/limits'
import { formatDuration, formatMoney } from '../lib/wallClock'
import { InactiveBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CheckField } from '../ui/CheckField'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { SidePanel } from '../ui/SidePanel'
import { Td, Th, TableFrame, Tr } from '../ui/Table'

/**
 * `/admin/services`: the catalogue, which is not the menu.
 *
 * The distinction `GLOSSARY.md` draws is the whole design of this screen. The **menu** is the
 * active services a client may choose from; the **catalogue** is what an admin curates, and it
 * holds what has been withdrawn just as it holds what is on offer. One endpoint serves both,
 * so the only difference is whether this screen asks for the wider view — and until it does,
 * an admin is looking at exactly what a client would see.
 *
 * Asking for it is the whole of issue 02 and ADR-0012: without `includeInactive` an admin
 * could withdraw a service and never see or recover it again, there being no other route that
 * would show it to them.
 *
 * Desktop-first, at 1280px, with `TableFrame`'s honest horizontal scroll below that. No phone
 * layout is attempted: an admin curating a catalogue is at a desk.
 */

/** The wider view, in the address, so it survives a refresh and can be sent to somebody. */
const INCLUDE_INACTIVE = 'includeInactive'

export function AdminServicesPage() {
  const [params, setParams] = useSearchParams()
  const includeInactive = params.get(INCLUDE_INACTIVE) === 'true'

  const services = useQuery(servicesQuery(includeInactive))
  const activation = useActivation(serviceAdmin)
  const editor = useCatalogueEditor(serviceAdmin)

  const rows = services.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">Services</h1>
        <p className="text-sm text-ink-soft">
          What the salon offers, and what it has withdrawn. A withdrawn service stays on every
          booking already made against it.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckField
          label="Show inactive"
          checked={includeInactive}
          onChange={(event) =>
            setParams(event.target.checked ? { [INCLUDE_INACTIVE]: 'true' } : {})
          }
        />

        <Button onClick={editor.create}>Add a service</Button>
      </div>

      {/*
       * A refusal with no dialog to carry it: putting a service back is not asked about, so
       * when that is what was refused the page is the only place left to say so.
       */}
      {activation.error !== undefined && activation.asking === undefined && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {activation.error}
        </p>
      )}

      {services.isPending && (
        <p role="status" className="text-sm text-ink-soft">
          Fetching the catalogue…
        </p>
      )}

      {services.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(services.error)}
        </p>
      )}

      {/*
       * A salon that has not filled its catalogue in yet. Nothing is wrong, so this is an
       * answer rather than an error — and with "Show inactive" off it can also mean every
       * service has been withdrawn, which the second sentence is for.
       */}
      {services.isSuccess && rows.length === 0 && (
        <EmptyState title="No services yet">
          {includeInactive
            ? 'The salon has not added a service yet. Add one and it goes straight on the menu.'
            : 'Nothing is on the menu. Add a service, or show the inactive ones to see what has been withdrawn.'}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <TableFrame>
          <thead>
            <tr>
              <Th>Service</Th>
              <Th>Duration</Th>
              <Th align="right">Price</Th>
              <Th>Active</Th>
              <Th>Edit</Th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <Tr key={row.id} dimmed={!row.isActive}>
                <Td>
                  <span className="flex items-center gap-2">
                    {row.name}
                    {!row.isActive && <InactiveBadge />}
                  </span>
                </Td>

                {/* The duration is what decides when a booking ends — the only thing that does. */}
                <Td>{formatDuration(row.durationMinutes)}</Td>

                <Td align="right">
                  <span className="tabular-nums">{formatMoney(row.price)}</span>
                </Td>

                <Td>
                  <ActivationToggle
                    kind="service"
                    row={row}
                    pending={activation.pendingId === row.id}
                    onToggle={(isActive) => activation.toggle(row, isActive)}
                  />
                </Td>

                <Td>
                  {/*
                   * Named, not just "Edit": twenty rows of identically labelled buttons are
                   * twenty controls a screen reader cannot tell apart.
                   */}
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => editor.edit(row)}
                  >
                    Edit
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <WithdrawalDialog kind="service" activation={activation} />
      <ServicePanel editor={editor} />
    </div>
  )
}

/**
 * The form, in the panel beside the list.
 *
 * Three fields, each with the browser's own bounds from `limits.ts` — which mirror
 * `CatalogueLimits.cs`, so a 250-character name cannot be typed, let alone sent. The server's
 * `errors` land on the same fields as the backstop, for the rules a browser cannot know: a
 * name of nothing but spaces trims away to nothing, and only the API knows that.
 */
function ServicePanel({ editor }: { editor: CatalogueEditor<Service, ServiceDraft> }) {
  const { draft, editing } = editor

  return (
    <SidePanel
      open={editor.open}
      onOpenChange={(open) => !open && editor.close()}
      title={editing === undefined ? 'Add a service' : `Edit ${editing.name}`}
      description={
        editing === undefined
          ? 'A new service goes straight on the menu, where clients can book it.'
          : // ADR-0003, to the only person who would ever worry about it: a booking records
            // what was agreed when it was made, name and price included.
            'Changes do not affect bookings already made — each keeps the name and price it was taken at.'
      }
      pending={editor.saving}
      opener={editor.opener}
    >
      {editor.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Fetching the service…
        </p>
      )}

      {draft !== undefined && !editor.loading && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            editor.save()
          }}
        >
          <Field
            label="Name"
            value={draft.name}
            required
            maxLength={limits.nameLength}
            autoComplete="off"
            errors={editor.fieldErrors.name}
            onChange={(event) => editor.change({ name: event.target.value })}
          />

          {/* The only thing that decides when a booking ends, which is why it is capped at a day. */}
          <Field
            label="Duration in minutes"
            type="number"
            inputMode="numeric"
            value={draft.durationMinutes}
            required
            min={limits.minDurationMinutes}
            max={limits.maxDurationMinutes}
            step={1}
            errors={editor.fieldErrors.durationMinutes}
            onChange={(event) => editor.change({ durationMinutes: event.target.value })}
          />

          {/* Free is allowed; owing the salon money is not. `decimal(10,2)` is the ceiling. */}
          <Field
            label="Price in RSD"
            type="number"
            inputMode="decimal"
            value={draft.price}
            required
            min={limits.minPrice}
            max={limits.maxPrice}
            step={0.01}
            errors={editor.fieldErrors.price}
            onChange={(event) => editor.change({ price: event.target.value })}
          />

          {editor.message !== undefined && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {editor.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={editor.saving} onClick={editor.close}>
              Close
            </Button>
            <Button type="submit" disabled={editor.saving}>
              {editor.saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </SidePanel>
  )
}
