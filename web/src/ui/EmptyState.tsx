import type { ReactNode } from 'react'

/**
 * Nothing to show, said as an answer rather than a failure.
 *
 * This matters more here than in most applications. `available-slots` returns an empty list
 * for a closed weekday, a retired stylist or a fully booked day — the API's own words: "Empty
 * is a real answer." Rendering that as an error would be wrong, and rendering it as a blank
 * area would be worse.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong bg-surface-sunken/50 px-6 py-10 text-center">
      {/*
        A heading, not styled text: this is the title of whatever the visitor is looking at
        instead of the thing they expected, and someone reading the page through a screen
        reader's heading list has as much business finding it as any other title.
      */}
      <h2 className="font-display text-xl text-ink">{title}</h2>
      {children !== undefined && (
        <p className="max-w-prose text-sm text-ink-soft">{children}</p>
      )}
      {action}
    </div>
  )
}
