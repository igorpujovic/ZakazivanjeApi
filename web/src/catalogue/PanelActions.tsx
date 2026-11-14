import { Button } from '../ui/Button'

/**
 * The two buttons at the foot of a catalogue panel.
 *
 * "Close", never "Cancel" — one screen away that word is the name of a thing done to
 * somebody's booking, and an application should not use it for two things.
 *
 * Shared by both panels because there is one answer here and it should not be given twice:
 * the submit button is inside the form so `Enter` in any field saves, and both buttons refuse
 * a second press while the request is in flight.
 */
export function PanelActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" disabled={saving} onClick={onClose}>
        Close
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
