import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/errors'
import { splitFieldErrors } from './fieldErrors'

/**
 * The bodies here are not invented. They were taken from a running instance — the spec for
 * this work is explicit that the casing of these keys is to be verified and not assumed — by
 * posting a deliberately invalid body to `/api/auth/register` and reading what came back:
 *
 *   {"errors":{"Name":[...],"Email":[...],"Password":[...]},"code":"invalid_request"}
 *
 * So DataAnnotations complaints arrive **PascalCase**, named after the C# property. A body that
 * cannot be deserialized at all arrives differently again, as a JSON *path*, alongside a
 * `request` key naming the whole bound parameter:
 *
 *   {"errors":{"request":[...],"$.email":[...]},"code":"invalid_request"}
 *
 * The bodies below are those two, verbatim. What the module makes of them is its own business
 * and documented there; this file is the evidence that they are what the API really sends.
 */

const register = (errors: Record<string, string[]>) =>
  new ApiError({ status: 400, code: 'invalid_request', title: 'One or more validation errors occurred.', fieldErrors: errors })

describe('the keys a DataAnnotations refusal arrives under', () => {
  it('lands PascalCase complaints on the camelCase fields the form has', () => {
    const error = register({
      Name: ['The Name field is required.'],
      Email: ['The Email field is not a valid e-mail address.'],
      Password: ['The field Password must be a string with a minimum length of 8 and a maximum length of 128.'],
    })

    const { byField, unmatched } = splitFieldErrors(error, ['name', 'email', 'password'])

    expect(byField.name).toEqual(['The Name field is required.'])
    expect(byField.email).toEqual(['The Email field is not a valid e-mail address.'])
    expect(byField.password).toHaveLength(1)
    expect(unmatched).toEqual([])
  })
})

describe('the keys a body that could not be deserialized arrives under', () => {
  it('reads a JSON path as the field it points at', () => {
    const error = register({
      request: ['The request field is required.'],
      '$.email': ['The JSON value could not be converted to System.String.'],
    })

    const { byField, unmatched } = splitFieldErrors(error, ['email', 'password'])

    expect(byField.email).toEqual(['The JSON value could not be converted to System.String.'])
    expect(byField.password).toBeUndefined()
    expect(unmatched).toEqual(['The request field is required.'])
  })

  it('keeps a key naming no field at all, rather than dropping it unseen', () => {
    // `request` is the whole bound parameter. It belongs to no field, and a form that silently
    // swallowed it would leave a refused submission looking like nothing happened.
    const error = register({ request: ['The request field is required.'] })

    const { byField, unmatched } = splitFieldErrors(error, ['email', 'password'])

    expect(byField).toEqual({})
    expect(unmatched).toEqual(['The request field is required.'])
  })
})

describe('a refusal that is not about fields', () => {
  it('has nothing to map', () => {
    const conflict = new ApiError({ status: 409, code: 'email_taken', detail: 'An account with that email already exists.' })

    expect(splitFieldErrors(conflict, ['email'])).toEqual({ byField: {}, unmatched: [] })
  })
})
