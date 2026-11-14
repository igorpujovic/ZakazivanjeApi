/**
 * The side panel's contents, on the way in and on the way out.
 *
 * An `<input>` holds a string whatever its `type`, and the API wants a name, an `int32` and a
 * `double`. That conversion is the whole of this module, and it is here rather than in the
 * panel because both `PUT`s are **full replacements** — every field, every time — which makes
 * a body with something missing not a smaller change but a different one.
 *
 * `isActive` is the field that shows why. `UpdateServiceRequest` requires it rather than
 * defaulting it, so that "an omitted flag would quietly undo a `DELETE` the next time someone
 * corrected a typo in the name". Here that becomes a parameter the caller cannot forget: the
 * panel passes the activation the row already had, and the inline toggle passes the one being
 * asked for. Neither can be expressed by leaving something out.
 *
 * Creation has no flag at all, in either direction — `CreateServiceRequest` has no `IsActive`,
 * because a service nobody could book is not worth creating.
 */

import type {
  CreateServiceBody,
  CreateStylistBody,
  Service,
  Stylist,
  UpdateServiceBody,
  UpdateStylistBody,
} from '../api/dto'

/** What the service panel's three inputs hold. Strings, because that is what an input holds. */
export interface ServiceDraft {
  name: string
  durationMinutes: string
  price: string
}

/** A stylist is a name. There is nothing else to know: a stylist has no account (GLOSSARY.md). */
export interface StylistDraft {
  name: string
}

/**
 * A number from an input, or a number the API will refuse.
 *
 * A number input empties to `""` rather than holding characters it cannot read — a half-typed
 * `"1e"` — and `required` is what stops an empty one being submitted. This covers the case
 * where one arrives anyway: `0` is outside both `[Range]`s, so the API refuses it and says so
 * on the field, where `NaN` would be written by `JSON.stringify` as `null`, read by the binder
 * as a missing field, and complained about in words about JSON rather than about a duration.
 */
function toNumber(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * The draft a panel opens with: the service as it stands, or nothing at all.
 *
 * Empty rather than prefilled for a new service. A duration of thirty minutes offered by
 * default would be a choice made on the salon's behalf and then never noticed, and `required`
 * asking for one costs an admin a single keystroke.
 */
export function serviceDraftFrom(service: Service | undefined): ServiceDraft {
  if (service === undefined) return { name: '', durationMinutes: '', price: '' }

  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),

    // `String` rather than a formatter: this is a value going back into a `type="number"`
    // input, which wants `2499.5` and not `2.499,50 RSD`. `formatMoney` is for reading.
    price: String(service.price),
  }
}

export function stylistDraftFrom(stylist: Stylist | undefined): StylistDraft {
  return { name: stylist?.name ?? '' }
}

/*
 * Names are sent exactly as typed, spaces and all. The API trims during binding and then
 * refuses a name that trimmed away to nothing, with the complaint landing on `Name` — so
 * trimming here would hide a server rule the panel is meant to surface, and would send a
 * different name from the one in the box.
 */

export function createServiceBody(draft: ServiceDraft): CreateServiceBody {
  return {
    name: draft.name,
    durationMinutes: toNumber(draft.durationMinutes),
    price: toNumber(draft.price),
  }
}

export function updateServiceBody(draft: ServiceDraft, isActive: boolean): UpdateServiceBody {
  return { ...createServiceBody(draft), isActive }
}

export function createStylistBody(draft: StylistDraft): CreateStylistBody {
  return { name: draft.name }
}

export function updateStylistBody(draft: StylistDraft, isActive: boolean): UpdateStylistBody {
  return { ...createStylistBody(draft), isActive }
}
