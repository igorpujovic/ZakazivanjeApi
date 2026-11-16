import { useId } from 'react'

import { shop } from '../brand/house'

/**
 * The pole and the name over the door.
 *
 * A barber's pole is the one sign that means *barber* with no words attached, so it is drawn
 * rather than lettered: brass caps, a glass body, and the stripes turning up the diagonal. It
 * is the only decoration in the application with no information in it, which is why it is
 * `aria-hidden` and why the name beside it is real text — a visitor with images off, or
 * reading by ear, gets the shop's name either way.
 *
 * The stripes are an SVG pattern rather than a dozen hand-placed parallelograms: one tile,
 * rotated, repeated by the renderer. Its id comes from `useId` because two poles on one page
 * (the header and a sign-in card) would otherwise define the same id twice, and the second
 * one would quietly win.
 */
export function PoleMark({ className = 'h-9 w-auto' }: { className?: string }) {
  const id = useId()
  const stripes = `${id}-stripes`
  const body = `${id}-body`

  return (
    <svg aria-hidden="true" viewBox="0 0 16 40" className={className}>
      <defs>
        <pattern
          id={stripes}
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-40)"
        >
          <rect width="12" height="12" fill="#ffffff" />
          <rect width="4.5" height="12" fill="var(--color-pole)" />
          <rect x="7.5" width="4.5" height="12" fill="var(--color-primary)" />
        </pattern>

        <clipPath id={body}>
          <rect x="2.6" y="5.2" width="10.8" height="29.6" rx="2" />
        </clipPath>
      </defs>

      {/* The glass, striped, with a soft highlight down its left side. */}
      <g clipPath={`url(#${body})`}>
        <rect x="2.6" y="5.2" width="10.8" height="29.6" fill={`url(#${stripes})`} />
        <rect x="2.6" y="5.2" width="3" height="29.6" fill="#ffffff" opacity="0.28" />
      </g>
      <rect
        x="2.6"
        y="5.2"
        width="10.8"
        height="29.6"
        rx="2"
        fill="none"
        stroke="var(--color-ink)"
        strokeOpacity="0.45"
        strokeWidth="0.8"
      />

      {/* Brass top and bottom, the finial on top. */}
      <rect x="0.8" y="2.6" width="14.4" height="4.4" rx="1.6" fill="var(--color-accent)" />
      <rect x="0.8" y="33" width="14.4" height="4.4" rx="1.6" fill="var(--color-accent)" />
      <circle cx="8" cy="1.4" r="1.4" fill="var(--color-accent)" />
      <circle cx="8" cy="38.6" r="1.4" fill="var(--color-accent)" />
    </svg>
  )
}

/**
 * The pole with the shop's name beside it — the header's link home, and the one place the
 * name is set in the display face.
 *
 * Both lines come from `brand/house.ts`: the name is not written here, so renaming the shop is
 * one edit in one file rather than a search through the markup.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <PoleMark className="h-10 w-auto shrink-0" />

      <span className="flex flex-col leading-tight">
        <span className="font-display text-xl font-semibold tracking-wide text-primary uppercase sm:text-2xl">
          {shop.name}
        </span>
        <span className="text-[0.65rem] font-medium tracking-[0.22em] text-accent-ink uppercase">
          {shop.neighbourhood} · Est. {shop.establishedYear}
        </span>
      </span>
    </span>
  )
}
