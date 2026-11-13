import { useRef } from 'react'

import { addMinutes, formatRange, type WallClock } from '../lib/wallClock'

/**
 * The starts on offer, as tap targets.
 *
 * The one novel widget in the application, so it gets the care: real touch sizes, arrow-key
 * navigation across the wrapped grid, and the stylist's name on each slot when the visitor
 * asked for no particular stylist.
 *
 * It also carries the sentence that makes the whole race explicable. A slot is an offer, not a
 * hold — two people can be shown the same start and the first to confirm takes it — and
 * someone who has been told that reads "that time was just taken" as the system working.
 */
export interface Slot {
  start: WallClock
  /** Present only when the visitor chose No preference and the grid is merged. */
  stylistId?: number
  stylistName?: string
}

export function SlotGrid({
  slots,
  durationMinutes,
  selected,
  onSelect,
  disabled,
}: {
  slots: readonly Slot[]
  durationMinutes: number
  selected?: WallClock
  onSelect: (slot: Slot) => void
  disabled?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)

  // Arrow keys walk the rendered order, which is ascending by time and stable. Home and End
  // jump to the first and last start of the day.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return

    const buttons = Array.from(
      container.current?.querySelectorAll<HTMLButtonElement>('button[data-slot]') ?? [],
    )
    if (buttons.length === 0) return

    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1

    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else next = current === -1 ? 0 : (current + step + buttons.length) % buttons.length

    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={container}
        role="group"
        aria-label="Available start times"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-2"
      >
        {slots.map((slot) => {
          const isSelected = slot.start === selected
          return (
            <button
              key={`${slot.start}-${slot.stylistId ?? 'any'}`}
              type="button"
              data-slot={slot.start}
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(slot)}
              className={[
                'flex min-h-11 min-w-24 flex-col items-center justify-center rounded-lg',
                'border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed',
                isSelected
                  ? 'border-primary bg-primary text-white'
                  : 'border-line-strong bg-surface text-ink hover:border-primary hover:bg-primary-soft',
              ].join(' ')}
            >
              <span className="font-medium tabular-nums">
                {formatRange(slot.start, addMinutes(slot.start, durationMinutes))}
              </span>
              {slot.stylistName !== undefined && (
                <span
                  className={isSelected ? 'text-xs text-white/80' : 'text-xs text-ink-faint'}
                >
                  {slot.stylistName}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-ink-faint">
        Times are not held until you confirm — if someone books the same time first, we will
        show you what is still free.
      </p>
    </div>
  )
}
