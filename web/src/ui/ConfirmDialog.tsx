import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import { Button } from './Button'
import { useOpenerFocus } from './openerFocus'

/**
 * "Are you sure?", asked properly.
 *
 * This is the one Radix component the client side uses, and the spec's reason for choosing it
 * is the whole of why: a modal is where focus trapping, focus restore, `Escape` handling and
 * `aria-modal` are easy to get wrong, and a hand-rolled one is where accessibility quietly
 * breaks. Radix gets those right; the styling is ours. Wrapped here rather than used directly
 * at call sites so there is one dialog in the application and not three divergent ones.
 *
 * The two buttons are deliberately *not* "Cancel" and "OK". On a screen whose action is itself
 * called cancelling, a dismiss button labelled "Cancel" is a genuine trap — so the call site
 * names both sides in its own words, and `cancelLabel` defaults to keeping things as they are
 * rather than to the word that would be ambiguous.
 */

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  title: string

  /** What agreeing will do, in the salon's words. Required: a bare title is not a question. */
  children: ReactNode

  /** The agreeing button. Says what happens, never "OK". */
  confirmLabel: string

  /** The declining button. Defaults to leaving things as they are. */
  cancelLabel?: string

  /**
   * `danger` for anything with no undo, which cancelling a booking is.
   *
   * The other tone is not speculation: the spec's admin catalogue "confirms, in glossary
   * wording — it disappears from the menu and existing bookings keep it, not 'this cannot be
   * undone', because reactivation makes it very much undoable". A withdrawal asks the same
   * question without being destructive, and painting its button red would contradict the
   * sentence beside it.
   */
  tone?: 'primary' | 'danger'

  /** In flight: both buttons refuse a second press and the agreeing one says so. */
  pending?: boolean

  /** Shown inside the dialog, where the question was asked, if agreeing was refused. */
  error?: string

  /**
   * The control this was opened from, which focus goes back to when it closes.
   *
   * Optional, because the screen that asks before cancelling a booking opens this from a
   * button that may be gone by the time the question is answered. Where it is passed — the
   * catalogue's activation toggle, which is still there afterwards — it is remembered at the
   * click rather than by Radix, for the reason `openerFocus.ts` sets out.
   */
  opener?: HTMLElement

  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'primary',
  pending = false,
  error,
  opener,
  onConfirm,
}: ConfirmDialogProps) {
  const restoreFocus = useOpenerFocus(open, opener)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />

        {/*
         * Centred, and capped at the viewport's width less the 16px gutter the rest of the
         * client side keeps, so it does not become the one thing on a 390px screen with a
         * horizontal scroll.
         */}
        <Dialog.Content
          className={[
            'fixed top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'flex flex-col gap-4 rounded-panel bg-surface p-5 shadow-xl',
          ].join(' ')}
          /*
           * A press on the overlay or `Escape` while the request is in flight would leave a
           * mutation running behind a dialog that has gone, and the answer — including a
           * refusal that needs reading — with nowhere to be shown. So the dialog stays until
           * the request settles.
           */
          onPointerDownOutside={(event) => pending && event.preventDefault()}
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onCloseAutoFocus={restoreFocus}
        >
          <Dialog.Title className="font-display text-xl text-ink">{title}</Dialog.Title>

          <Dialog.Description asChild>
            <div className="flex flex-col gap-2 text-sm text-ink-soft">{children}</div>
          </Dialog.Description>

          {error !== undefined && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={pending}>
                {cancelLabel}
              </Button>
            </Dialog.Close>

            <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
              {pending ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
