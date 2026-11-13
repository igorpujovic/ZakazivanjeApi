/**
 * Input bounds, mirroring the API's own.
 *
 * These exist so the browser can refuse a 250-character service name without a round trip.
 * They are a *mirror*, not the authority: the API's DataAnnotations are the validator, and
 * `errors` on a `400` is the backstop for anything the browser cannot know — `email_taken`,
 * or a name of nothing but spaces that trims away to nothing.
 *
 * Mirrored from:
 *   - `ZakazivanjeApi/Dtos/CatalogueLimits.cs`  — NAME_LENGTH, MAX_DURATION_MINUTES, MAX_PRICE
 *   - `ZakazivanjeApi/Dtos/RegisterRequest.cs`  — the register bounds
 *
 * The authoritative numbers do reach the generated OpenAPI document as `maxLength` /
 * `minimum` / `maximum`; `openapi-typescript` drops them when it emits types. If this
 * duplication ever bites, that document is the place to derive them from.
 */

export const limits = {
  /** `nvarchar(200)`, for both service and stylist names. */
  nameLength: 200,

  /** A day. Nothing longer could fit inside a weekday's working hours. */
  maxDurationMinutes: 24 * 60,
  minDurationMinutes: 1,

  /** The largest value `decimal(10,2)` holds. Free is allowed; negative is not. */
  maxPrice: 99_999_999.99,
  minPrice: 0,

  register: {
    nameMin: 2,
    nameMax: 200,
    emailMax: 256,
    passwordMin: 8,
    passwordMax: 128,
  },
} as const
