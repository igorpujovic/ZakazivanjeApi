/**
 * Which drawing goes beside a service on the menu.
 *
 * A service is `{ id, name, durationMinutes, price, isActive }` and nothing else — there is
 * no category and no icon field, and inventing one on the server would mean an admin choosing
 * a picture for every row they add. So the name is all there is to go on, and this reads it:
 * a beard trim gets a beard, a hot towel shave gets a razor, anything unrecognised gets a
 * pair of scissors, which is never wrong in a barbershop.
 *
 * Guessing is acceptable *because* the fallback is harmless and the icon is decoration — the
 * name beside it is what the visitor actually reads, and it is `aria-hidden` for that reason.
 * Pure and keyword-ordered so the guesses can be written down as a test rather than discovered
 * on the menu: "beard trim" has to find the beard before "trim" finds the comb, and "hot towel
 * shave" has to find the razor before "towel" finds the towel.
 *
 * Both languages, because the catalogue is an admin's to fill in and this one is in Belgrade.
 */

import { createElement, type ComponentType } from 'react'

import {
  AirIcon,
  BeardIcon,
  ClippersIcon,
  CombIcon,
  DropletIcon,
  RazorIcon,
  ScissorsIcon,
  TowelIcon,
  type IconProps,
} from '../ui/icons'

type IconComponent = ComponentType<IconProps>

/**
 * First match wins, so the order is the rule. The specific sits above the general: shaving and
 * beards above cutting, colour above washing, and the bare words — cut, trim — last.
 */
const RULES: readonly (readonly [readonly string[], IconComponent])[] = [
  [['beard', 'brada', 'moustache', 'brkovi', 'goatee'], BeardIcon],
  [['shave', 'brijanje', 'razor', 'brijač', 'neck tidy'], RazorIcon],
  [['colour', 'color', 'highlight', 'tint', 'bleach', 'farban', 'boja'], DropletIcon],
  [['wash', 'shampoo', 'pranje', 'basin'], DropletIcon],
  [['dry', 'style', 'styling', 'finish', 'feniranje'], AirIcon],
  [['towel', 'peškir', 'facial', 'treatment', 'massage', 'masaža'], TowelIcon],
  [['clipper', 'fade', 'buzz', 'skin', 'machine', 'mašin', 'crew'], ClippersIcon],
  [['cut', 'haircut', 'šišanje', 'sisanje'], ScissorsIcon],
  [['trim', 'tidy', 'comb', 'kid', 'child', 'deč'], CombIcon],
]

/**
 * The icon for a service, as an element ready to render.
 *
 * A component rather than something a screen looks up and assigns to a capitalised variable
 * of its own: that pattern reads to a linter — reasonably — like a component being *created*
 * during render, which resets its state every time. Nothing here has state, but the shape is
 * worth keeping honest, and one element is what the call sites actually wanted.
 */
export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  return createElement(iconForService(name), { className })
}

/** Which of the drawings a service's name points at. Scissors when nothing matches. */
export function iconForService(name: string): IconComponent {
  const haystack = name.toLocaleLowerCase()

  for (const [keywords, icon] of RULES) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return icon
  }

  return ScissorsIcon
}
