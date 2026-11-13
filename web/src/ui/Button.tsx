import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-line-strong',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-sunken disabled:text-ink-faint',
  danger: 'bg-danger-soft text-danger border border-danger/20 hover:bg-danger hover:text-white',
  ghost: 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
}

const SIZES: Record<Size, string> = {
  // 44px minimum touch target: the client side is used one-handed on a phone.
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    />
  )
}
