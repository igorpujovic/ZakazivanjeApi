/**
 * Changing the catalogue: the four write routes, behind one shape the two screens share.
 *
 * The screens are the same screen twice — a table, a checkbox, an inline toggle and a side
 * panel — over two halves of the catalogue that the API treats differently in exactly three
 * places. Rather than let those differences spread through two components, each is settled
 * once here, and what the hooks and the panels see is one {@link CatalogueAdmin}.
 *
 * The three differences:
 *
 * 1. **Withdrawing a service is `DELETE`; withdrawing a stylist is `PUT`.** There is no
 *    `DELETE` for a stylist, because every booking ever taken points at one. And `DELETE` on a
 *    service sets `IsActive` false *and nothing else*, which is the better request for a
 *    toggle: it cannot carry a stale name from a row that was fetched minutes ago, the way a
 *    full replacement would. Nothing is deleted either way — see `withdrawal.ts`.
 *
 * 2. **Putting something back is always `PUT`**, service or stylist, because the flag is the
 *    only thing that sets it and no other route does (ADR-0004). So reactivation is a full
 *    replacement whichever half of the catalogue it is.
 *
 * 3. **Only a service can be read back by id.** `GET /api/services/{id}` resolves a withdrawn
 *    service, which is what the edit panel opens through. Stylists have no such route, so that
 *    panel opens on the row it was clicked from. See {@link CatalogueAdmin.load}.
 */

import { api } from '../api/client'
import type { Service, Stylist } from '../api/dto'
import {
  createServiceBody,
  createStylistBody,
  serviceDraftFrom,
  stylistDraftFrom,
  updateServiceBody,
  updateStylistBody,
  type ServiceDraft,
  type StylistDraft,
} from './catalogueDraft'
import { catalogueKeys } from './catalogue'
import type { CatalogueKind } from './withdrawal'

/** What both halves of the catalogue have in common, which is everything a row shows. */
export interface CatalogueRow {
  id: number
  name: string
  isActive: boolean
}

/**
 * One half of the catalogue, as its two screens need it.
 *
 * `Row` is the API's type and `Draft` is the panel's. Keeping them apart is what stops a form
 * value reaching a request without passing through `catalogueDraft.ts`.
 */
export interface CatalogueAdmin<Row extends CatalogueRow, Draft> {
  kind: CatalogueKind

  /** The query key prefix to invalidate: both the menu and the admin's wider view of it. */
  root: readonly string[]

  /** The draft a panel opens with: a row being edited, or nothing for a new one. */
  draftFrom: (row: Row | undefined) => Draft

  /**
   * The row as the API has it *now*, for the panel to open on, or `undefined` where the API
   * offers no way to ask.
   *
   * Only services can be asked for: `GET /api/services/{id}` is the only route in the API that
   * answers with an inactive row by id, and it is the panel's reason for existing as a
   * request at all — the alternative is editing a copy that was fetched before whatever
   * somebody else did a minute ago, and then `PUT`ting it back as a full replacement.
   */
  load: ((id: number) => Promise<Row>) | undefined

  create: (draft: Draft) => Promise<Row>
  update: (row: Row, draft: Draft) => Promise<Row>

  /**
   * On or off, by whichever route the API gives for it.
   *
   * One function rather than two, because the toggle has one job and the asymmetry between
   * `DELETE` and `PUT` is not something a screen should have to know.
   */
  setActive: (row: Row, isActive: boolean) => Promise<unknown>
}

export const serviceAdmin: CatalogueAdmin<Service, ServiceDraft> = {
  kind: 'service',
  root: catalogueKeys.serviceRoot,

  draftFrom: serviceDraftFrom,
  load: (id) => api.get<Service>(`/services/${id}`),

  create: (draft) => api.post<Service>('/services', createServiceBody(draft)),

  // A full replacement carrying the activation the row already had, so correcting a typo in a
  // withdrawn service's name cannot put it back on the menu by omission.
  update: (row, draft) =>
    api.put<Service>(`/services/${row.id}`, updateServiceBody(draft, row.isActive)),

  setActive: (row, isActive) =>
    isActive
      ? api.put<Service>(`/services/${row.id}`, updateServiceBody(serviceDraftFrom(row), true))
      : api.delete(`/services/${row.id}`),
}

export const stylistAdmin: CatalogueAdmin<Stylist, StylistDraft> = {
  kind: 'stylist',
  root: catalogueKeys.stylistRoot,

  draftFrom: stylistDraftFrom,

  // No route reads one stylist back. `StylistResponse` is `{ id, name, isActive }`, so the row
  // already holds everything the panel edits — there is nothing a request could add.
  load: undefined,

  create: (draft) => api.post<Stylist>('/stylists', createStylistBody(draft)),
  update: (row, draft) =>
    api.put<Stylist>(`/stylists/${row.id}`, updateStylistBody(draft, row.isActive)),

  setActive: (row, isActive) =>
    api.put<Stylist>(`/stylists/${row.id}`, updateStylistBody(stylistDraftFrom(row), isActive)),
}
