import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/authContext'
import { returnToFrom } from '../auth/returnTo'
import { useAuthForm } from '../auth/useAuthForm'
import { limits } from '../lib/limits'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

/** The fields this form has, in its own casing. What the server's keys are matched against. */
const FIELDS = ['email', 'password'] as const

/**
 * Set by the register form, in the one case where arriving here is not a plain sign-in: the
 * account was created but the sign-in that should have followed it was not. Nothing else sends
 * state — a guard and a `401` both send only `returnTo`, in the query string.
 */
interface LoginNavigationState {
  email?: string
  accountCreated?: boolean
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const state = (location.state ?? {}) as LoginNavigationState

  const [email, setEmail] = useState(state.email ?? '')
  const [password, setPassword] = useState('')

  const form = useAuthForm(FIELDS)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()

    void form.submit(async () => {
      await signIn({ email, password })
      navigate(returnToFrom(location.search), { replace: true })
    })
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      {/*
       * The form on headed paper. The striped rule along the top is the shop's, the same
       * one the header and the menu card carry: a sign-in page is where an application
       * usually stops looking like itself, and a visitor sent here by a guard should still
       * be able to see whose door they are standing at.
       */}
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        <div aria-hidden className="pole-rule h-1.5" />
        <div className="flex flex-col p-5 sm:p-6">
          <h1 className="font-display text-3xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your appointments, and a quicker way back into the chair.
          </p>

          {state.accountCreated === true && (
            <p role="status" className="mt-4 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
              Your account was created. Please sign in to continue.
            </p>
          )}

          {form.message !== undefined && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              {form.message}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <Field
              label="Email"
              /*
               * `type="email"` here, even though `LoginRequest` deliberately carries no
               * `[EmailAddress]` on the server — the API refuses to tell a caller their email is
               * malformed, because that is one more way of saying which addresses exist here. The
               * browser's own check tells nobody anything, and it puts the right keyboard in front
               * of someone signing in on a phone.
               */
              type="email"
              autoComplete="email"
              required
              maxLength={limits.register.emailMax}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              errors={form.fieldErrors.email}
            />

            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              /*
               * No `minLength` on the way in. The bounds belong on registration, where they are the
               * rule being applied; here they would only refuse an old password that was set under
               * different ones, locally, without asking the API.
               */
              maxLength={limits.register.passwordMax}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              errors={form.fieldErrors.password}
            />

            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-sm text-ink-soft">
            No account yet?{' '}
            <Link to={`/register${location.search}`} className="font-medium text-primary underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
