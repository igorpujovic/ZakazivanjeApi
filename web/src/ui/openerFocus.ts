/**
 * Giving focus back to the control that opened a dialog.
 *
 * Radix restores focus on its own, and for a dialog whose contents never change it is right.
 * It captures `document.activeElement` in the effect that sets up its focus scope — and that
 * effect depends on handlers `DialogContent` composes inline, so it re-runs on **every
 * re-render of the dialog**, recapturing as it goes. By then focus is inside the dialog, so
 * what gets remembered is the dialog itself, and when that goes the browser falls back to
 * `<body>`.
 *
 * Both of this application's dialogs re-render while open — the side panel when the service it
 * is editing arrives, either of them when a request starts — so both would leave a keyboard
 * user at the top of the document, having lost the row they were working on. That is the one
 * thing a hand-rolled modal is supposed to get wrong, and it would be a poor showing for the
 * component chosen *because* focus restore is hard.
 *
 * So the opener is remembered where it is unambiguous — at the click, by the hook that opens
 * the dialog, which is {@link openerNow} — and handed back here. The handler refuses Radix's
 * own restore in every case, which also stops the spurious mid-render event moving focus out
 * of an open dialog.
 */

import { useCallback, useEffect, useRef } from 'react'

/**
 * Whatever has focus right now: the button that is mid-click, which is exactly the control a
 * dialog should hand focus back to when it closes.
 */
export function openerNow(): HTMLElement | undefined {
  const active = document.activeElement
  return active instanceof HTMLElement ? active : undefined
}

/**
 * An `onCloseAutoFocus` handler that returns focus to `opener`.
 *
 * `open` is read through a ref because this fires from a timer: Radix dispatches the same
 * event when its scope is merely being set up again, and the only way to tell that from a real
 * close is whether the dialog is still open by the time the timer runs.
 */
export function useOpenerFocus(
  open: boolean,
  opener: HTMLElement | undefined,
): (event: Event) => void {
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  return useCallback(
    (event: Event) => {
      // No opener was remembered, so this is a caller that has not opted in: leave Radix's own
      // restore alone rather than quietly change what it does.
      if (opener === undefined) return

      // Ours from here: Radix's answer is the wrong one, and doing nothing is better than
      // moving focus somewhere nobody asked for.
      event.preventDefault()

      // Still open, so this is a re-render rather than a close. Leave focus where it is.
      if (openRef.current) return

      // Gone from the page — the row it was on is no longer listed, say. There is nothing
      // better to offer, and `<body>` is where Radix would have landed too.
      if (!opener.isConnected) return

      opener.focus()
    },
    [opener],
  )
}
