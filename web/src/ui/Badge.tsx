import type { BookingStatus } from '../api/dto'

type Tone = 'neutral' | 'success' | 'danger' | 'muted'

const TONES: Record<Tone, string> = {
  neutral: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-surface-sunken text-ink-faint',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-xs font-medium whitespace-nowrap',
        TONES[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/**
 * A booking's status. The three names come from the API as names, not numbers, so the API does
 * not depend on the order of a C# enum — and neither does this.
 *
 * `Scheduled` is the only status a booking can still change from, so it reads as the live one;
 * `Completed` and `Cancelled` are terminal and read as settled.
 */
const STATUS_TONES: Record<BookingStatus, Tone> = {
  Scheduled: 'neutral',
  Completed: 'success',
  Cancelled: 'muted',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status in STATUS_TONES ? STATUS_TONES[status as BookingStatus] : 'muted'
  return <Badge tone={tone}>{status}</Badge>
}

/** Shown on a catalogue row the salon has withdrawn. Never the word "deleted". */
export function InactiveBadge() {
  return <Badge tone="muted">Inactive</Badge>
}
