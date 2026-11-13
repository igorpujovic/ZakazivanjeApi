import type { ReactNode } from 'react'

/**
 * A plain table, scrolled horizontally when it does not fit.
 *
 * The admin side is desktop-first and this is deliberately not a responsive card layout: the
 * bookings table is seven columns plus two actions, a receptionist uses a keyboard, and an
 * honest horizontal scroll beats a stack of cards pretending a table was a mistake.
 */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, align }: { children: ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={[
        'border-b border-line px-3 py-2.5 font-medium whitespace-nowrap text-ink-soft',
        align === 'right' ? 'text-right' : '',
      ].join(' ')}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align,
  muted,
}: {
  children: ReactNode
  align?: 'right'
  muted?: boolean
}) {
  return (
    <td
      className={[
        'border-b border-line/60 px-3 py-2.5 align-middle',
        align === 'right' ? 'text-right' : '',
        muted === true ? 'text-ink-faint' : '',
      ].join(' ')}
    >
      {children}
    </td>
  )
}

/** A withdrawn catalogue row: dimmed, still legible, still actionable. */
export function Tr({ children, dimmed }: { children: ReactNode; dimmed?: boolean }) {
  return <tr className={dimmed === true ? 'opacity-55' : undefined}>{children}</tr>
}
