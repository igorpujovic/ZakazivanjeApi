/**
 * The server's field complaints, landed on the form's fields.
 *
 * Native constraints on the inputs catch nearly everything before a request is sent. This is
 * the backstop, for what the browser cannot know — an email already taken, a name of nothing
 * but spaces that trims away to nothing — and it exists because the API's DataAnnotations are
 * a working, tested validator and a second one written in TypeScript would drift from it
 * silently.
 *
 * The keys were **verified against a running instance** rather than assumed, which the spec
 * for this work insists on, and they come in three shapes:
 *
 *   `Name`, `Email`, `Password`   DataAnnotations, named after the C# property, PascalCase.
 *                                 `AddControllers()` here does not register
 *                                 `SystemTextJsonValidationMetadataProvider`, so these are not
 *                                 camel-cased to match the JSON the form actually sent.
 *
 *   `$.email`                     The input formatter, when a value could not be deserialized.
 *                                 A JSON path, so camelCase, and prefixed.
 *
 *   `request`                     The whole bound parameter, when the body could not be read at
 *                                 all. Names no field.
 *
 * Three shapes for one question is why this is a module. Matching is on the last path segment,
 * case-insensitively, so all three land where they belong without the form knowing any of it.
 */

import type { ApiError } from '../api/errors'

export interface SplitFieldErrors<Field extends string> {
  /** Messages for fields the form has, keyed by the form's own name for them. */
  byField: Partial<Record<Field, string[]>>

  /**
   * Messages whose key named no field the form offered.
   *
   * Returned rather than dropped. In practice this is the `request` key above, which means the
   * request body was malformed — a bug in this application, not something the visitor did — and
   * a form that swallowed it would leave a refused submission looking like nothing happened.
   */
  unmatched: string[]
}

/**
 * The field a server key is about: the last segment of the path, lower-cased.
 *
 * `$.email` → `email`, `Name` → `name`. That is the whole rule, because those are the only two
 * shapes the API produces for a field it can name.
 */
function fieldOf(key: string): string {
  return (key.split('.').at(-1) ?? key).toLowerCase()
}

/**
 * Splits a refusal's `errors` into the form's fields and whatever was left over.
 *
 * `fields` is the form's own list, in its own casing, and is what decides a match — so a form
 * cannot accidentally display a complaint about a field it does not show.
 */
export function splitFieldErrors<Field extends string>(
  error: ApiError,
  fields: readonly Field[],
): SplitFieldErrors<Field> {
  const byField: Partial<Record<Field, string[]>> = {}
  const unmatched: string[] = []

  if (error.fieldErrors === undefined) return { byField, unmatched }

  const wanted = new Map(fields.map((field) => [field.toLowerCase(), field]))

  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const field = wanted.get(fieldOf(key))

    if (field === undefined) {
      unmatched.push(...messages)
      continue
    }

    // Appended, not assigned: `Email` and `$.email` can both arrive in one body, and the
    // second must not silently replace the first.
    byField[field] = [...(byField[field] ?? []), ...messages]
  }

  return { byField, unmatched }
}
