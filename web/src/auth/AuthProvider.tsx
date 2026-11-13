import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { setTokenProvider, setUnauthorizedHandler } from '../api/client'
import {
  isAdmin as isAdminUser,
  type AuthResult,
  type LoginBody,
  type RegisterBody,
} from '../api/dto'
import { login as postLogin, registerThenLogin } from './authApi'
import { AuthContext, type AuthContextValue } from './authContext'
import { loginPathFor } from './returnTo'
import {
  clearStoredSession,
  readStoredSession,
  sessionFromAuthResult,
  sessionStatus,
  storeSession,
  type Session,
} from './session'

/*
 * The token the API client reaches for, wired once when this module loads.
 *
 * It reads storage rather than React state, which settles three things at once. The client
 * needs the token at *request* time, and effects run bottom-up — so a guarded screen's first
 * query fires before this component's effects would have run, and registering in an effect
 * would send that one request unauthenticated. Reading storage also means there is no render
 * phase write to a module slot and no closure to keep in step with the latest render. And
 * since `readStoredSession` discards an expired session, a token the application already knows
 * is dead cannot go out even if React state has not caught up yet.
 */
setTokenProvider(() => readStoredSession(Date.now())?.accessToken)

/**
 * The session, held once, for the whole application.
 *
 * What is left here is the wiring that needs React: the state screens render from, the single
 * timer, and giving up on a token the API has rejected. Everything *about* a session — whether
 * it has expired, when to warn, how long is left — is in `session.ts`, which is pure and
 * tested.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Read during the first render rather than in an effect. An effect would render one frame
  // signed out, by which point every guard below has already redirected to login.
  const [session, setSession] = useState<Session | undefined>(() => readStoredSession(Date.now()))
  const [expiryWarningMinutes, setExpiryWarningMinutes] = useState<number | undefined>(undefined)

  const navigate = useNavigate()
  const location = useLocation()

  const endSession = useCallback(() => {
    clearStoredSession()
    setSession(undefined)
    setExpiryWarningMinutes(undefined)
  }, [])

  const startSession = useCallback((auth: AuthResult): Session => {
    const next = sessionFromAuthResult(auth)
    storeSession(next)
    setSession(next)
    setExpiryWarningMinutes(undefined)
    return next
  }, [])

  /*
   * Giving up on a token the API has rejected — revoked early, or signed with a key that has
   * since changed. Nothing to salvage, so the session goes and the visitor is returned to
   * where they were once they are back in.
   *
   * In an effect, not in the render body, so only a render that actually committed can
   * register it and the handler always holds the location the visitor is really on. The client
   * only calls this for requests that carried the session, so a refused *login* never lands
   * here (see `api/client.ts`).
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession()
      navigate(loginPathFor(location), { replace: true })
    })
  }, [endSession, navigate, location])

  /**
   * One timer, and no schedule of its own.
   *
   * It asks `sessionStatus` what the session looks like and when to ask again, which is what
   * makes a reloaded tab behave: a visitor who comes back with three minutes left is warned
   * immediately rather than having missed the moment, and the count then falls a minute at a
   * time instead of sitting on its first value.
   *
   * Expiry clears the session and stops there. On a guarded screen the guard then redirects,
   * with the right `returnTo` for wherever the visitor actually is, and on a public screen
   * there is nothing to redirect away from — so navigating from here as well would only be a
   * second route to the same place.
   */
  useEffect(() => {
    if (session === undefined) return

    let timer: ReturnType<typeof setTimeout>

    const check = () => {
      const status = sessionStatus(session, Date.now())

      if (status.expired) {
        endSession()
        return
      }

      setExpiryWarningMinutes(status.warnMinutes)
      timer = setTimeout(check, status.nextCheckInMilliseconds)
    }

    check()

    return () => clearTimeout(timer)
  }, [session, endSession])

  const signIn = useCallback(
    async (credentials: LoginBody) => startSession(await postLogin(credentials)),
    [startSession],
  )

  const registerAndSignIn = useCallback(
    async (body: RegisterBody) => startSession(await registerThenLogin(body)),
    [startSession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user,
      isAdmin: isAdminUser(session?.user),
      expiryWarningMinutes,
      signIn,
      registerAndSignIn,
      signOut: endSession,
    }),
    [session, expiryWarningMinutes, signIn, registerAndSignIn, endSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
