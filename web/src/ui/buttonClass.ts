/**
 * How a button looks — separately from `Button`, for the few places that must not *be* one.
 *
 * A `<Link>` that reads as the primary action — the one in `/bookings`' empty state, pointing
 * at the menu — has to stay an anchor. It navigates, so it belongs in the tab order as a link,
 * it opens in a new tab on a middle click, and it shows its destination on hover; a `<button>`
 * calling `navigate` gives all three up. Reaching for this rather than hand-copying a class
 * string is what keeps the primitives a system rather than a pile of utility classes (see the
 * spec's "Styling and responsiveness").
 *
 * In its own module because `Button.tsx` must export only components: oxlint's
 * `react(only-export-components)` is right that mixing the two breaks fast refresh.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-line-strong',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-sunken disabled:text-ink-faint',
  danger: 'bg-danger-soft text-danger border border-danger/20 hover:bg-danger hover:text-white',
  ghost: 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
}

const SIZES: Record<ButtonSize, string> = {
  // 44px minimum touch target: the client side is used one-handed on a phone.
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
    'transition-colors disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
  ].join(' ')
}
