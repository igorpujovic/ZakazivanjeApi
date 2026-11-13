import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  /**
   * The server's complaints for this field, straight from a `400`'s `errors`. Rendered as
   * given: they are the framework's own model-binding messages, about the request that was
   * sent, and rewording them would only make them less accurate.
   */
  errors?: string[]
  hint?: ReactNode
}

export function Field({ label, errors, hint, className = '', ...rest }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const invalid = errors !== undefined && errors.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [hint ? hintId : undefined, invalid ? errorId : undefined]
            .filter(Boolean)
            .join(' ')
            .trim() || undefined
        }
        className={[
          'min-h-11 rounded-lg border bg-surface px-3',
          invalid ? 'border-danger' : 'border-line-strong',
          className,
        ].join(' ')}
        {...rest}
      />

      {hint !== undefined && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}

      {invalid && (
        <ul id={errorId} className="text-xs text-danger">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
