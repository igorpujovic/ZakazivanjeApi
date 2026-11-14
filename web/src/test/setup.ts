import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Four browser APIs jsdom does not implement, which Radix's Select really uses.
 *
 * `ui/Select.tsx` is the admin side's dropdown, and Radix drives it with pointer capture so a
 * press-and-drag selects an option the way a native control does, then scrolls the chosen item
 * into view. jsdom implements neither capability — three pointer-capture methods and
 * `scrollIntoView` — so without these a test that opens the list dies with
 * `target.hasPointerCapture is not a function` — a gap in the test environment rather than
 * anything wrong with the component.
 *
 * Stubs rather than implementations on purpose: pointer capture decides which element keeps
 * receiving events during a drag, and nothing in this application's behaviour depends on the
 * answer. `hasPointerCapture` answering "no" is the truth in a test that never dragged.
 */
/*
 * Reached through an index signature because TypeScript is describing a real browser, where
 * all four of these exist and none of them could be missing. The gap is jsdom's, so the check
 * has to be a runtime one.
 */
const element = Element.prototype as unknown as Record<string, unknown>

if (typeof element.hasPointerCapture !== 'function') {
  element.hasPointerCapture = () => false
  element.setPointerCapture = () => {}
  element.releasePointerCapture = () => {}
}

if (typeof element.scrollIntoView !== 'function') {
  element.scrollIntoView = () => {}
}

afterEach(() => {
  cleanup()
})
