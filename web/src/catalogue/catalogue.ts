/**
 * The catalogue, and the menu, which are not the same thing.
 *
 * `GLOSSARY.md` keeps them apart and so does this module. The **catalogue** is services *and*
 * stylists, active or not, as an admin curates them; the **menu** is the active services a
 * client may choose from. One endpoint serves both, answering differently by role — issue 02
 * and ADR-0012 — so the only difference here is whether `includeInactive` is sent.
 *
 * Which means the client side does no filtering of its own. A client asking `GET /api/services`
 * is already being handed the menu, and a frontend that filtered again would be keeping a
 * second, weaker copy of the rule in a place where nobody could enforce it.
 */

import { queryOptions } from '@tanstack/react-query'

import { api } from '../api/client'
import type { Service, Stylist } from '../api/dto'

/**
 * `includeInactive` appears in the key, because the two answers are genuinely different
 * lists — an admin ticking "Show inactive" must not be served the menu out of the cache.
 */
/**
 * The two prefixes everything else here hangs off, named once so `roots` cannot drift from
 * the individual ones.
 */
const SERVICE_ROOT = ['services'] as const
const STYLIST_ROOT = ['stylists'] as const

export const catalogueKeys = {
  services: (includeInactive: boolean) => ['services', { includeInactive }] as const,
  stylists: (includeInactive: boolean) => ['stylists', { includeInactive }] as const,

  /**
   * One row, read back by id — the admin edit panel's query. Under the same prefix as the list
   * it came from, so one invalidation reaches the panel's copy of a row as well as the table's.
   *
   * Only services can be asked for: `GET /api/services/{id}` is the only route in the API that
   * answers with an inactive row by id. The key is written for either half of the catalogue
   * anyway, because the panel is one piece of code serving both.
   */
  byId: (root: readonly string[], id: number) => [...root, 'byId', id] as const,

  /**
   * One list, whatever `includeInactive` it was last fetched with — a prefix, so one
   * invalidation reaches the menu and the admin's wider view of the same endpoint together.
   * That is what makes a service withdrawn on `/admin/services` leave the menu on `/`.
   */
  serviceRoot: SERVICE_ROOT,
  stylistRoot: STYLIST_ROOT,

  /** Both lists, for the one caller that has made either of them out of date. */
  roots: [SERVICE_ROOT, STYLIST_ROOT] as const,
}

// `true` or nothing: `?includeInactive=false` would be an admin-only parameter on an
// anonymous request, which is a thing to explain rather than a thing to send.
const includeInactiveParam = (includeInactive: boolean) => (includeInactive ? true : undefined)

/**
 * The services. With `includeInactive` left alone this **is** the menu; pass `true` as an
 * admin to get the whole catalogue, withdrawn services included.
 */
export function servicesQuery(includeInactive = false) {
  return queryOptions({
    queryKey: catalogueKeys.services(includeInactive),
    queryFn: ({ signal }) =>
      api.get<Service[]>('/services', { query: { includeInactive: includeInactiveParam(includeInactive) }, signal }),
  })
}

/** The stylists. Active only by default — the ones a client can actually be booked with. */
export function stylistsQuery(includeInactive = false) {
  return queryOptions({
    queryKey: catalogueKeys.stylists(includeInactive),
    queryFn: ({ signal }) =>
      api.get<Stylist[]>('/stylists', { query: { includeInactive: includeInactiveParam(includeInactive) }, signal }),
  })
}
