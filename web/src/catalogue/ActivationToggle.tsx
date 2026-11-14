import type { CatalogueRow } from './catalogueAdmin'
import { activationLabel, type CatalogueKind } from './withdrawal'

/**
 * Whether a row may be chosen for a *new* booking, as one switch on the row itself.
 *
 * A native checkbox given `role="switch"`, which is a pairing ARIA allows and which keeps
 * every behaviour the browser already has: the space bar operates it, a label click reaches
 * it, and its state is announced without anything here maintaining `aria-checked` by hand.
 * The spec allows Radix for Dialog and Select only, and the reason — focus trapping and ARIA
 * are easy to get wrong — is exactly what a checkbox does not have a problem with.
 *
 * The input is hidden and a styled track drawn beside it, so the control looks like a switch
 * while remaining one. Colour is not the only thing saying which way it is set: a withdrawn
 * row is dimmed and carries an "Inactive" badge next to its name, which is the part a reader
 * who cannot see the colour is actually served by.
 */
export function ActivationToggle<Row extends CatalogueRow>({
  kind,
  row,
  pending,
  onToggle,
}: {
  kind: CatalogueKind
  row: Row
  /** This row's own request is in flight. Per row, so one toggle does not freeze the table. */
  pending: boolean
  onToggle: (isActive: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={row.isActive}
        disabled={pending}
        aria-label={activationLabel(kind, row.name)}
        onChange={(event) => onToggle(event.target.checked)}
      />

      <span
        aria-hidden="true"
        className={[
          'relative h-5 w-9 rounded-full bg-line-strong transition-colors',
          'after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full',
          'after:bg-surface after:transition-transform after:content-[""]',
          'peer-checked:bg-primary peer-checked:after:translate-x-4',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2',
          'peer-disabled:opacity-50',
        ].join(' ')}
      />
    </label>
  )
}
