/**
 * The session context, kept apart from the component that provides it.
 *
 * Its own file for two reasons: a module that exports both a component and a hook defeats
 * React Fast Refresh, and every screen that needs the session should be able to reach for
 * {@link useAuth} without importing the provider.
 */

import { createContext, useContext } from 'react'

import type { LoginBody, RegisterBody, User } from '../api/dto'
import type { Session } from './session'

export interface AuthContextValue {
  session: Session | undefined
  user: User | undefined

  /**
   * Whether the signed-in user is an admin, from `user.role` as the API reported it.
   * `AuthResponse` carries the role precisely so no frontend has to decode the JWT.
   */
  isAdmin: boolean

  /**
   * Minutes left, once there are few enough to say so, and `undefined` the rest of the time.
   * See `session.ts` for why a warning is all there is to offer.
   */
  expiryWarningMinutes: number | undefined

  signIn: (credentials: LoginBody) => Promise<Session>

  /** Register, then log in with the same credentials. See `authApi.registerThenLogin`. */
  registerAndSignIn: (body: RegisterBody) => Promise<Session>

  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === undefined) throw new Error('useAuth was called outside AuthProvider')
  return value
}
