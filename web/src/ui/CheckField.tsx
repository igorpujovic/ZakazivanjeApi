import { useId, type InputHTMLAttributes } from 'react'

/**
 * A native checkbox with its label beside it.
 *
 * `Field` puts a label above an input, which is right for a name or a price and wrong for a
 * tick box: the label of a checkbox belongs next to it, and the whole pair should be clickable.
 *
 * Native, and no Radix. The spec allows Radix for Dialog and Select only, and the reason given
 * is that those two are where focus trapping and ARIA quietly break. A checkbox is not: the
 * browser's own is keyboard-operable, announces its state and reports it to a form, which is
 * every behaviour a styled one would have to reimplement.
 */
export function CheckField({
  label,
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & { label: string }) {
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className={`size-4 accent-primary ${className}`}
        {...rest}
      />
      <label htmlFor={id} className="text-sm text-ink select-none">
        {label}
      </label>
    </div>
  )
}
