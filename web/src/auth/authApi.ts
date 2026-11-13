/**
 * The two public endpoints, and the one awkward thing about them.
 *
 * `POST /api/auth/register` answers `201` with a `UserResponse` and **no token**, so
 * registering does not sign you in. That is deliberate on the API's side and not worth
 * reversing for the frontend's convenience, so the frontend chains the two calls instead:
 * register, then log in with the credentials still in memory. {@link registerThenLogin} is
 * where that chain lives, so no screen has to remember to do it.
 */

import { api } from '../api/client'
import type { AuthResult, LoginBody, RegisterBody, User } from '../api/dto'

// Both anonymous: they are how a session is obtained, so neither carries one, and a 401 from
// login is about the credentials in it rather than about a session (see `api/client.ts`).
export function login(credentials: LoginBody): Promise<AuthResult> {
  return api.post<AuthResult>('/auth/login', credentials, { anonymous: true })
}

export function register(body: RegisterBody): Promise<User> {
  return api.post<User>('/auth/register', body, { anonymous: true })
}

/**
 * Raised when the account was created but the sign-in that should have followed was not.
 *
 * This is the one failure in the chain that must not read as "registration failed", because
 * registration did not fail — the email is taken now, by them, and telling them to try again
 * would walk them into `email_taken` on their own address. The register form catches this
 * specifically and sends them to `/login` with the email filled in and the account's existence
 * stated outright.
 */
export class AccountCreatedButNotSignedIn extends Error {
  readonly email: string

  constructor(email: string, cause: unknown) {
    super('Your account was created, but signing you in did not work.')
    this.name = 'AccountCreatedButNotSignedIn'
    this.email = email
    this.cause = cause
  }
}

export async function registerThenLogin(body: RegisterBody): Promise<AuthResult> {
  await register(body)

  try {
    return await login({ email: body.email, password: body.password })
  } catch (cause) {
    throw new AccountCreatedButNotSignedIn(body.email, cause)
  }
}
