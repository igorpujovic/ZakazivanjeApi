import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import { useOpenerFocus } from './openerFocus'

/**
 * A panel that slides in beside the list, for creating and editing one row of it.
 *
 * A panel rather than a route, which is what keeps the application's eight routes at eight —
 * and what keeps the list visible behind the form, so an admin filling one in can still see
 * what the rest of the catalogue says.
 *
 * Radix's Dialog, like `ConfirmDialog`, and for the same reason the spec gives: focus
 * trapping, focus restore, `Escape` and `aria-modal` are where hand-rolled overlays quietly
 * break accessibility. A side panel is a modal dialog that happens to be against an edge, so
 * it gets the same component and only different styling.
 *
 * The frame only. What goes inside is the screen's own form, because a service has three
 * fields and a stylist has one, and a component that tried to own both would be a form
 * builder.
 */
export interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  title: string

  /**
   * One line under the title, saying what this panel does or does not do.
   *
   * Required, because Radix warns about a dialog with no description and because both of this
   * one's callers have something worth saying there: for an edit it is ADR-0003 — changes do
   * not reach bookings already made — which is the one thing an admin might otherwise fear.
   */
  description: ReactNode

  children: ReactNode

  /** A request is in flight: `Escape` and an outside press are refused until it settles. */
  pending?: boolean

  /**
   * The control this was opened from, which focus goes back to when it closes.
   *
   * Remembered by the caller at the click rather than by Radix, for the reason `openerFocus.ts`
   * sets out: a dialog that re-renders while open loses Radix's own answer to this.
   */
  opener?: HTMLElement
}

export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  pending = false,
  opener,
}: SidePanelProps) {
  const restoreFocus = useOpenerFocus(open, opener)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />

        <Dialog.Content
          className={[
            'fixed inset-y-0 right-0 flex w-full max-w-md flex-col gap-5 overflow-y-auto',
            'border-l border-line bg-surface p-6 shadow-xl',
          ].join(' ')}
          /*
           * Dismissing mid-request would leave a mutation running behind a panel that has
           * gone, and its answer — including a refusal that has to be read — with nowhere to
           * be shown. The same rule as `ConfirmDialog`'s, for the same reason.
           */
          onPointerDownOutside={(event) => pending && event.preventDefault()}
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onCloseAutoFocus={restoreFocus}
        >
          <header className="flex flex-col gap-1">
            <Dialog.Title className="font-display text-2xl text-ink">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-ink-soft">
              {description}
            </Dialog.Description>
          </header>

          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
