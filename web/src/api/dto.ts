/**
 * Readable names for the generated schema types.
 *
 * These are aliases, not re-declarations: every one resolves into `schema.d.ts`, so nothing
 * here can drift from the API. The generated file stays the contract; this file only spares
 * the rest of the application from writing `components['schemas']['BookingResponse']`.
 */

import type { components } from './schema'

type Schemas = components['schemas']

export type Booking = Schemas['BookingResponse']
export type Service = Schemas['ServiceResponse']
export type Stylist = Schemas['StylistResponse']
export type User = Schemas['UserResponse']
export type AuthResult = Schemas['AuthResponse']
export type AvailableSlots = Schemas['AvailableSlotsResponse']
export type PagedBookings = Schemas['PagedResponseOfBookingResponse']

export type LoginBody = Schemas['LoginRequest']
export type RegisterBody = Schemas['RegisterRequest']
export type CreateBookingBody = Schemas['CreateBookingRequest']
export type CreateServiceBody = Schemas['CreateServiceRequest']
export type UpdateServiceBody = Schemas['UpdateServiceRequest']
export type CreateStylistBody = Schemas['CreateStylistRequest']
export type UpdateStylistBody = Schemas['UpdateStylistRequest']

/**
 * A booking's status, as a name rather than a number — the API sends the name on purpose, so
 * it does not depend on the order of a C# enum.
 *
 * The generated type is `string`, since OpenAPI carries no enum for it. These are the three
 * from `GLOSSARY.md`: `Scheduled` is the only status a booking can still change from, and
 * `Completed` and `Cancelled` are both terminal.
 */
export type BookingStatus = 'Scheduled' | 'Completed' | 'Cancelled'

export function isBookingStatus(value: string): value is BookingStatus {
  return value === 'Scheduled' || value === 'Completed' || value === 'Cancelled'
}

/** A user's role. Registration always produces a `Client`; the first admin is seeded. */
export type Role = 'Client' | 'Admin'

export function isAdmin(user: Pick<User, 'role'> | undefined): boolean {
  return user?.role === 'Admin'
}
