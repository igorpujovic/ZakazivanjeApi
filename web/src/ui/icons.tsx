import type { ReactNode, SVGProps } from 'react'

/**
 * The shop's small drawings.
 *
 * Hand-drawn rather than installed, for the same reason the spec gives for hand-building the
 * primitives: a reviewer recognises a library instantly and the visual credit goes to the
 * library. Eleven paths is also less weight than any icon package, and the set is small
 * because it is only what this application actually names — a chair, a pair of scissors, a
 * razor, a beard, the three facts about the shop.
 *
 * All of them share one frame: a 24×24 box, `currentColor`, stroked rather than filled, so an
 * icon takes the colour and the size of the text it sits beside and nothing has to be
 * restyled per place. Every one is `aria-hidden`: each sits next to words that already say
 * what it means, and an icon that announced itself would make a screen reader say everything
 * twice.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>

/** The frame. Not exported: an icon is one of the named ones below, or it is not in the set. */
function Icon({ className = 'size-5', ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    />
  )
}

/** The barber's own tool, and the application's general mark for a cut. */
export function ScissorsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="18" r="2.6" />
      <circle cx="17.5" cy="18" r="2.6" />
      <path d="M8.7 16.1 18.6 4" />
      <path d="M15.3 16.1 5.4 4" />
      <path d="M12 10.2 13.4 8.6" />
    </Icon>
  )
}

/** A safety razor, head down: a shave, a neck tidy, anything with a blade and foam. */
export function RazorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.4h11a1 1 0 0 1 1 1v2.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z" />
      <path d="M12 7.6v3" />
      <path d="M10.1 10.6h3.8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3.8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
      <path d="M9.1 14h5.8M9.1 16.6h5.8" />
    </Icon>
  )
}

/** Clippers, teeth upward. Short back and sides, fades, anything with a number on it. */
export function ClippersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.2v2.4M12 3.2v2.4M15 3.2v2.4" />
      <path d="M8 8.2 9.2 5.6h5.6L16 8.2" />
      <path d="M7.4 8.2h9.2a1.6 1.6 0 0 1 1.6 1.6v9a1.6 1.6 0 0 1-1.6 1.6H7.4a1.6 1.6 0 0 1-1.6-1.6v-9a1.6 1.6 0 0 1 1.6-1.6Z" />
      <path d="M5.8 12.4h12.4" />
    </Icon>
  )
}

/** A jaw with a moustache over it: beard trims and beard shaping. */
export function BeardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.4 4.8v4.6c0 4.8 2.6 9.4 6.6 9.4s6.6-4.6 6.6-9.4V4.8" />
      <path d="M8.4 9.4c1.2.9 2.3 1.3 3.6 1.3s2.4-.4 3.6-1.3" />
      <path d="M10.2 13.6c.6.5 1.2.7 1.8.7s1.2-.2 1.8-.7" />
    </Icon>
  )
}

/** A comb: styling, a dry trim, a parting put back where it belongs. */
export function CombIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 6.4h16.8a1.4 1.4 0 0 1 1.4 1.4v1.4H2.2V7.8a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M5 9.2v5.4M8.5 9.2v8.4M12 9.2v5.4M15.5 9.2v8.4M19 9.2v5.4" />
    </Icon>
  )
}

/** A drop: a wash, a colour, anything that happens at the basin. */
export function DropletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.2c3.6 4.3 5.6 7 5.6 9.5a5.6 5.6 0 0 1-11.2 0c0-2.5 2-5.2 5.6-9.5Z" />
      <path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" />
    </Icon>
  )
}

/** Moving air: a blow dry, a finish, a quick tidy with the dryer. */
export function AirIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8h10.5a3 3 0 1 0-3-3" />
      <path d="M3 12h13.5a3 3 0 1 1-3 3" />
      <path d="M3 16h7.5" />
    </Icon>
  )
}

/** A hot towel, folded: the extras at the end of a shave. */
export function TowelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5.6h14a1.4 1.4 0 0 1 1.4 1.4v10a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4V7a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M3.6 9.6h16.8M7.4 5.6v12.8" />
      <path d="M11.4 12.4c1.6.9 3.2.9 4.8 0" />
    </Icon>
  )
}

/** The barber's chair. The mark for a person who cuts hair, rather than a service. */
export function ChairIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3.8h10a1.4 1.4 0 0 1 1.4 1.4v6.4H5.6V5.2A1.4 1.4 0 0 1 7 3.8Z" />
      <path d="M4.2 11.6h15.6a1.2 1.2 0 0 1 1.2 1.2v1.2a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 14v-1.2a1.2 1.2 0 0 1 1.2-1.2Z" />
      <path d="M12 15.2v3.2M8.4 20.4h7.2" />
      <path d="M12 18.4a2 2 0 0 0-2 2M12 18.4a2 2 0 0 1 2 2" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3 1.8" />
    </Icon>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21c4-4.6 6-7.8 6-10.4a6 6 0 1 0-12 0C6 13.2 8 16.4 12 21Z" />
      <circle cx="12" cy="10.4" r="2.2" />
    </Icon>
  )
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.2 3.6H6a2.4 2.4 0 0 0-2.4 2.6c.5 7.4 6.6 13.5 14 14A2.4 2.4 0 0 0 20.4 18v-2.2a1.4 1.4 0 0 0-1.1-1.4l-3.1-.7a1.4 1.4 0 0 0-1.4.5l-.9 1.1a12.6 12.6 0 0 1-4.9-4.9l1.1-.9a1.4 1.4 0 0 0 .5-1.4l-.7-3.1a1.4 1.4 0 0 0-1.4-1.1Z" />
    </Icon>
  )
}

/** A small mark for a sentence that is a point in a list rather than a paragraph. */
export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.6l2.3 5.1 5.5.6-4.1 3.7 1.1 5.4L12 15.7l-4.8 2.7 1.1-5.4-4.1-3.7 5.5-.6Z" />
    </Icon>
  )
}
