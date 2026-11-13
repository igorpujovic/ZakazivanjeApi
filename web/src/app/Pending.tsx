import { EmptyState } from '../ui/EmptyState'

/**
 * A route whose screen is built by a later issue.
 *
 * Deliberately explicit rather than a blank page: anyone running this mid-build should be able
 * to see which issue fills the gap, and it keeps the eight routes real from the start so the
 * navigation and the guards can be wired before the screens exist.
 */
export function Pending({ screen, issue }: { screen: string; issue: string }) {
  return (
    <EmptyState title={screen}>
      This screen is built in issue {issue}. The shell, the API client and the wall-clock
      module are in place.
    </EmptyState>
  )
}
