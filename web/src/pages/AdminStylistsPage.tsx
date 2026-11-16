import { useQuery } from '@tanstack/react-query'

import type { Stylist } from '../api/dto'
import { ActivationToggle } from '../catalogue/ActivationToggle'
import { PanelActions } from '../catalogue/PanelActions'
import { stylistsQuery } from '../catalogue/catalogue'
import { stylistAdmin } from '../catalogue/catalogueAdmin'
import type { StylistDraft } from '../catalogue/catalogueDraft'
import { useActivation } from '../catalogue/useActivation'
import { useIncludeInactive } from '../catalogue/useIncludeInactive'
import { useCatalogueEditor, type CatalogueEditor } from '../catalogue/useCatalogueEditor'
import { WithdrawalDialog } from '../catalogue/WithdrawalDialog'
import { messageFor } from '../lib/errorCopy'
import { limits } from '../lib/limits'
import { InactiveBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CheckField } from '../ui/CheckField'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { SidePanel } from '../ui/SidePanel'
import { Td, Th, TableFrame, Tr } from '../ui/Table'

/**
 * `/admin/stylists`: the other half of the catalogue.
 *
 * The same screen as `/admin/services` over a row that is only a name. A stylist has no
 * account and never signs in — they are a name on the schedule — so there is nothing else to
 * show and nothing else to edit. That is also why there is no stylist detail page: it would
 * show exactly what this list already does.
 *
 * Two things differ from the services screen, and both are the API's doing rather than this
 * screen's. There is **no `DELETE`** for a stylist, because every booking ever taken points at
 * one and that history has to keep resolving (ADR-0004) — so withdrawing is the same `PUT`
 * that renames. And there is **no route that reads one stylist back**, so the panel opens on
 * the row rather than on a fresh answer. Both are settled in `catalogueAdmin.ts`.
 */

export function AdminStylistsPage() {
  const [includeInactive, setIncludeInactive] = useIncludeInactive()

  const stylists = useQuery(stylistsQuery(includeInactive))
  const activation = useActivation(stylistAdmin)
  const editor = useCatalogueEditor(stylistAdmin)

  const rows = stylists.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold text-ink">Stylists</h1>
        <p className="text-sm text-ink-soft">
          Who the salon can book clients in with. A withdrawn stylist keeps every booking
          already made with them.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckField
          label="Show inactive"
          checked={includeInactive}
          onChange={(event) => setIncludeInactive(event.target.checked)}
        />

        <Button onClick={editor.create}>Add a stylist</Button>
      </div>

      {/* A refusal with no dialog to carry it: offering somebody again is not asked about. */}
      {activation.error !== undefined && activation.asking === undefined && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {activation.error}
        </p>
      )}

      {stylists.isPending && (
        <p role="status" className="text-sm text-ink-soft">
          Fetching the stylists…
        </p>
      )}

      {stylists.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(stylists.error)}
        </p>
      )}

      {stylists.isSuccess && rows.length === 0 && (
        <EmptyState title="No stylists yet">
          {includeInactive
            ? 'The salon has not added a stylist yet. Nobody can be booked until one is here.'
            : 'Nobody is taking bookings. Add a stylist, or show the inactive ones to see who has been withdrawn.'}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <TableFrame>
          <thead>
            <tr>
              <Th>Stylist</Th>
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

                <Td>
                  <ActivationToggle
                    kind="stylist"
                    row={row}
                    pending={activation.pendingId === row.id}
                    onToggle={(isActive) => activation.toggle(row, isActive)}
                  />
                </Td>

                <Td>
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

      <WithdrawalDialog kind="stylist" activation={activation} />
      <StylistPanel editor={editor} />
    </div>
  )
}

/**
 * One field, and the same bounds the API validates against.
 *
 * No pending state to render: there is no route to read a stylist back, so the panel has
 * everything it needs the moment it opens.
 */
function StylistPanel({ editor }: { editor: CatalogueEditor<Stylist, StylistDraft> }) {
  const { draft, editing } = editor

  return (
    <SidePanel
      open={editor.open}
      onOpenChange={(open) => !open && editor.close()}
      title={editing === undefined ? 'Add a stylist' : `Edit ${editing.name}`}
      description={
        editing === undefined
          ? 'A new stylist can be booked straight away. A stylist has no account and never signs in.'
          : // The same promise as a service's, for the same reason: a booking records what was
            // agreed when it was made (ADR-0003).
            'Changes do not affect bookings already made — each keeps the name it was taken with.'
      }
      pending={editor.saving}
      opener={editor.opener}
    >
      {draft !== undefined && (
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

          {editor.message !== undefined && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {editor.message}
            </p>
          )}

          <PanelActions saving={editor.saving} onClose={editor.close} />
        </form>
      )}
    </SidePanel>
  )
}
