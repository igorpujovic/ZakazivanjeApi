/**
 * "Show inactive": the difference between the menu and the whole catalogue, in the address.
 *
 * In the address rather than in component state, so the wider view survives a refresh and can
 * be sent to somebody — and so it reads the same way as `/admin/bookings`, where the day a
 * screen is showing is in the address for the same reasons.
 *
 * The parameter is spelled as the API spells it, because it is the same question being asked
 * of the same endpoint: `?includeInactive=true` widens `GET /api/services` and
 * `GET /api/stylists` from the menu to the catalogue, admin-only (issue 02, ADR-0012).
 *
 * Both catalogue screens use it, which is why it is here: the parameter's name, the fact that
 * only `true` is ever written, and the rule that nothing else in the address is disturbed are
 * one decision and should not be made twice.
 */

import { useSearchParams } from 'react-router-dom'

const INCLUDE_INACTIVE = 'includeInactive'

export function useIncludeInactive(): [boolean, (next: boolean) => void] {
  const [params, setParams] = useSearchParams()

  const set = (next: boolean) => {
    // Built from what is already there: this screen owns one parameter and has no business
    // clearing any other the address happens to carry.
    const updated = new URLSearchParams(params)

    // Written only when true. `?includeInactive=false` would be an admin-only parameter
    // sitting in the address saying nothing, and an address carries the choices somebody
    // actually made.
    if (next) updated.set(INCLUDE_INACTIVE, 'true')
    else updated.delete(INCLUDE_INACTIVE)

    setParams(updated)
  }

  return [params.get(INCLUDE_INACTIVE) === 'true', set]
}
