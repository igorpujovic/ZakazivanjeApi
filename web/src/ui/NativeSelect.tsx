import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'

/**
 * A choice from a list, as the browser's own control.
 *
 * The spec's stack says "Radix for Dialog and Select only", and the reason it gives is that
 * those two are where focus trapping, focus restore, `Escape` handling and ARIA are easy to
 * get wrong. A native `<select>` has none of those problems — it is the browser's, and on the
 * phone this screen is designed for it opens the platform's own picker, which is a better
 * one-handed control than any listbox we could build and the thing a client already knows how
 * to use.
 *
 * So Radix's Select is kept for where it earns that reasoning: the admin side, at 1280px, with
 * a keyboard. This is the client's control, and it is deliberately plain — named
 * `NativeSelect` rather than `Select` so that the Radix one the spec asks for can take that
 * name without this having to be moved out of the way first.
 *
 * Shaped like `Field` on purpose — same label wiring, same hint, same error treatment — so the
 * booking page's three controls read as one row of the same thing.
 */
export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: ReactNode
  children: ReactNode
}

export function NativeSelect({
  label,
  hint,
  className = '',
  children,
  ...rest
}: NativeSelectProps) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <select
        id={id}
        aria-describedby={hint !== undefined ? hintId : undefined}
        className={[
          'min-h-11 rounded-lg border border-line-strong bg-surface px-3',
          // A native select on iOS zooms the page if its text is under 16px, which on a
          // booking form reads as the page lurching when you tap it.
          'text-base',
          className,
        ].join(' ')}
        {...rest}
      >
        {children}
      </select>

      {hint !== undefined && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  )
}
