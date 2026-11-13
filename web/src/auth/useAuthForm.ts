/**
 * The state the two auth forms share: one in-flight submission, one refusal, and the server's
 * field complaints mapped onto the fields.
 *
 * Not a `useMutation`: there is no cache to invalidate and nothing to retry — `invalid_credentials`
 * does not become valid on a second attempt — and a hook of three `useState`s reads better than
 * a mutation configured to do none of the things a mutation is for.
 */

import { useCallback, useState } from 'react'

import { isApiError, isNetworkError, type ApiError } from '../api/errors'
import { copyFor } from '../lib/errorCopy'
import { splitFieldErrors } from './fieldErrors'

export interface AuthFormState<Field extends string> {
  submitting: boolean
  /** One line for the top of the form, or `undefined` when nothing has been refused. */
  message: string | undefined
  fieldErrors: Partial<Record<Field, string[]>>
  submit: (run: () => Promise<unknown>) => Promise<void>

  /**
   * Puts a message on one field by hand.
   *
   * For a refusal the API does not express as a field error but which unmistakably is one.
   * `email_taken` is the case: it is a `409` from `AuthService`, not a DataAnnotations `400`,
   * so it carries no `errors` map — and a banner above a form whose email box looks perfectly
   * fine is a worse answer than putting it where the problem is.
   */
  failField: (field: Field, message: string) => void
}

export function useAuthForm<Field extends string>(
  fields: readonly Field[],
): AuthFormState<Field> {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string[]>>>({})

  const failField = useCallback((field: Field, text: string) => {
    setMessage(undefined)
    setFieldErrors({ [field]: [text] } as Partial<Record<Field, string[]>>)
  }, [])

  const submit = useCallback(
    async (run: () => Promise<unknown>) => {
      setSubmitting(true)
      setMessage(undefined)
      setFieldErrors({})

      try {
        await run()
      } catch (error) {
        if (isApiError(error)) {
          const refusal = refusalToForm(error, fields)
          setFieldErrors(refusal.fieldErrors)
          setMessage(refusal.message)
        } else if (isNetworkError(error)) {
          setMessage(error.message)
        } else {
          // Not a refusal and not a network failure, so it is a bug in us. Say something true
          // and generic rather than render an exception at somebody trying to sign in.
          setMessage('Something went wrong. Please try again.')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [fields],
  )

  return { submitting, message, fieldErrors, submit, failField }
}

/**
 * A refusal, as this form should show it: pure, so it can be read without tracing state.
 *
 * A `400` whose complaints all landed on fields needs no banner — the fields are saying it,
 * and `invalid_request` carries no `detail` to show anyway, which is how the API distinguishes
 * "look at the fields" from "read this".
 *
 * `unmatched` means a key that named no field this form has. On this API that is the `request`
 * key, meaning the body could not be deserialized at all — a bug here rather than anything the
 * visitor did — so it is surfaced rather than swallowed, because a submission that was refused
 * and then said nothing is the worst of the options.
 */
function refusalToForm<Field extends string>(
  error: ApiError,
  fields: readonly Field[],
): { message: string | undefined; fieldErrors: Partial<Record<Field, string[]>> } {
  const { byField, unmatched } = splitFieldErrors(error, fields)

  if (Object.keys(byField).length > 0) {
    return { message: undefined, fieldErrors: byField }
  }

  return {
    message: unmatched.length > 0 ? unmatched.join(' ') : copyFor(error).message,
    fieldErrors: {},
  }
}
