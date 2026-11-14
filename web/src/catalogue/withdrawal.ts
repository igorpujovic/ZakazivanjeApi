/**
 * Withdrawing something from the catalogue, in the salon's own words.
 *
 * This is the copy `GLOSSARY.md` governs most directly in the whole application, so it lives
 * in one module that both screens read rather than in two components that could drift. The
 * **Active** entry is the specification:
 *
 * > Whether a service or a stylist may be chosen for a *new* booking. Making something
 * > inactive withdraws it from the menu; it stays on every booking already made against it.
 * > _Avoid_: Enabled, visible, deleted, archived
 *
 * Three things follow from it, and each is the opposite of what a confirmation dialog usually
 * says. The verb is **withdraw**, never delete — the route really is
 * `DELETE /api/services/{id}` and nothing about that reaches a person, because nothing is
 * deleted. The bookings already made are untouched, which is the half an admin is actually
 * worried about. And it is **not** irreversible: putting something back is one toggle, so
 * "this cannot be undone" would be a plain untruth told to frighten someone out of tidying
 * their own catalogue.
 *
 * Only switching **off** is asked about. Reactivating is harmless, and a dialog guarding a
 * harmless action teaches an admin to dismiss dialogs.
 */

/** The two halves of the catalogue. A service is on the menu; a stylist is not. */
export type CatalogueKind = 'service' | 'stylist'

export interface WithdrawalQuestion {
  title: string

  /** The body, a paragraph at a time: what happens, what does not, and the way back. */
  lines: readonly [string, string]

  confirmLabel: string

  /**
   * The declining button, which is never the word "Cancel". One screen away that word is the
   * name of a thing done to somebody's booking, and an application should not use it for two
   * things — least of all as the safe half of a question about something else.
   */
  keepLabel: string
}

/**
 * The accessible name of a row's activation toggle.
 *
 * It names the row, because a table of twenty switches all called "Active" is twenty controls
 * a screen reader cannot tell apart — and because the switch is the control that changes what
 * every client is offered, which is not a thing to press by accident.
 */
export function activationLabel(kind: CatalogueKind, name: string): string {
  return kind === 'service' ? `${name} — on the menu` : `${name} — available for new bookings`
}

export function withdrawalQuestion(kind: CatalogueKind, name: string): WithdrawalQuestion {
  if (kind === 'service') {
    return {
      title: `Withdraw ${name} from the menu?`,
      lines: [
        `${name} comes off the menu, so no new booking can be made against it.`,

        // The promise, and then the way back, in that order: the worry first and the
        // reassurance second is how an admin reads it.
        'The bookings already made against it keep it, unchanged. You can put it back on the menu at any time.',
      ],
      confirmLabel: 'Withdraw it',
      keepLabel: 'Keep it on the menu',
    }
  }

  return {
    // A stylist is not on the menu — the menu is the active services a client chooses from —
    // so the sentence is about new bookings, which is the other half of the glossary's entry.
    title: `Withdraw ${name} from new bookings?`,
    lines: [
      `${name} is no longer offered when a client picks a stylist.`,
      'The bookings already made with them keep their name, unchanged. You can offer them again at any time.',
    ],
    confirmLabel: 'Withdraw them',
    keepLabel: 'Keep them available',
  }
}
