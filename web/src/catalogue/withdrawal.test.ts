import { describe, expect, it } from 'vitest'

import { withdrawalQuestion } from './withdrawal'

/**
 * The one question the catalogue asks, and the one place the glossary governs the copy more
 * than anywhere else in the application.
 *
 * `GLOSSARY.md`'s **Active** entry is the whole specification: "Making something inactive
 * withdraws it from the menu; it stays on every booking already made against it", with
 * _deleted_ and _archived_ listed as words to avoid. So the assertions below are about what
 * the sentences have to say and what they must never say — not about their exact wording,
 * which is free to improve without this file objecting.
 *
 * Tested away from React because both screens ask it and the copy must not drift between
 * them: a withdrawal that reads one way for a service and another for a stylist would be two
 * glossaries.
 */

const SERVICE = withdrawalQuestion('service', 'Women’s cut')
const STYLIST = withdrawalQuestion('stylist', 'Ana')
const BOTH = [SERVICE, STYLIST]

/** Every word a reader would meet, title and body and buttons together. */
const wordsOf = (question: (typeof BOTH)[number]) =>
  [question.title, ...question.lines, question.confirmLabel, question.keepLabel].join(' ')

describe('what the question says', () => {
  it('names the thing being withdrawn, so a mis-clicked row is caught before it is confirmed', () => {
    expect(SERVICE.title).toContain('Women’s cut')
    expect(STYLIST.title).toContain('Ana')
  })

  /** The verb, in both directions: the button agrees with the title. */
  it('calls it withdrawing', () => {
    for (const question of BOTH) {
      expect(question.title.toLowerCase()).toContain('withdraw')
      expect(question.confirmLabel.toLowerCase()).toContain('withdraw')
    }
  })

  /** A service leaves the **menu**; the menu is what a client chooses from. */
  it('says a service leaves the menu', () => {
    expect(wordsOf(SERVICE).toLowerCase()).toContain('menu')
  })

  /**
   * A stylist is not on the menu — the menu is services — so the sentence has to be about new
   * bookings instead. The glossary's **Active** entry covers both: whether a service *or a
   * stylist* may be chosen for a new booking.
   */
  it('says a stylist stops being offered for new bookings, without putting them on the menu', () => {
    expect(wordsOf(STYLIST).toLowerCase()).toContain('new booking')
    expect(wordsOf(STYLIST).toLowerCase()).not.toContain('menu')
  })

  /** The half of the glossary entry an admin is actually worried about. */
  it('promises the bookings already made keep it', () => {
    for (const question of BOTH) {
      expect(wordsOf(question).toLowerCase()).toMatch(/bookings already made/)
    }
  })

  /**
   * The ticket is explicit: not "this cannot be undone", because reactivating makes it very
   * much undoable. Saying so is the difference between an admin tidying the catalogue and an
   * admin afraid to touch it.
   */
  it('says it can be put back, and never that it cannot be undone', () => {
    for (const question of BOTH) {
      const words = wordsOf(question).toLowerCase()

      expect(words).toMatch(/at any time/)
      expect(words).not.toMatch(/cannot be undone|permanent|forever|irreversible/)
    }
  })

  /** Nothing is deleted. The route is `DELETE`; the salon's word is not. */
  it('never says delete, or any of the glossary’s other words to avoid', () => {
    for (const question of BOTH) {
      expect(wordsOf(question).toLowerCase()).not.toMatch(/delet|remov|archiv|disable/)
    }
  })

  /**
   * The declining button must not be the word "cancel". On a catalogue screen that is only
   * confusing; one screen away it is the name of an action taken against somebody's booking,
   * and the application should not use it for two things.
   */
  it('offers a way out that is not the word cancel', () => {
    for (const question of BOTH) {
      expect(question.keepLabel.toLowerCase()).not.toContain('cancel')
      expect(question.keepLabel.toLowerCase()).toContain('keep')
    }
  })
})
