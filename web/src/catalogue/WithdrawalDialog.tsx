import { ConfirmDialog } from '../ui/ConfirmDialog'
import type { CatalogueRow } from './catalogueAdmin'
import type { Activation } from './useActivation'
import { withdrawalQuestion, type CatalogueKind } from './withdrawal'

/**
 * The one question the catalogue asks, wired to the toggle that asks it.
 *
 * The words are `withdrawal.ts`', so the two screens cannot drift apart, and the tone is
 * **not** `danger`: painting the button red would contradict the sentence beside it, which
 * says this can be undone at any time. `ConfirmDialog` offers the quieter tone for precisely
 * this case.
 */
export function WithdrawalDialog<Row extends CatalogueRow>({
  kind,
  activation,
}: {
  kind: CatalogueKind
  activation: Activation<Row>
}) {
  const row = activation.asking
  const question = row === undefined ? undefined : withdrawalQuestion(kind, row.name)

  /*
   * Rendered whether or not there is a question, with `open` saying which — rather than
   * returned as `null` when there is none.
   *
   * Not a style choice. A dialog that unmounts the moment it is answered takes its own closing
   * with it, and the focus it was holding goes to `<body>` rather than back to the toggle that
   * opened it (`ui/openerFocus.ts`). Radix renders nothing while `open` is false, so the empty
   * title below is never on screen.
   */
  return (
    <ConfirmDialog
      open={row !== undefined}
      onOpenChange={(open) => !open && activation.dismiss()}
      title={question?.title ?? ''}
      confirmLabel={question?.confirmLabel ?? ''}
      cancelLabel={question?.keepLabel}
      pending={activation.pendingId !== undefined}
      error={activation.error}
      opener={activation.opener}
      onConfirm={activation.confirm}
    >
      {question?.lines.map((line) => <p key={line}>{line}</p>)}
    </ConfirmDialog>
  )
}
