import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { isApiError } from '../api/errors'
import { AccountCreatedButNotSignedIn } from '../auth/authApi'
import { useAuth } from '../auth/authContext'
import { returnToFrom } from '../auth/returnTo'
import { useAuthForm } from '../auth/useAuthForm'
import { copyFor } from '../lib/errorCopy'
import { limits } from '../lib/limits'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

const FIELDS = ['name', 'email', 'password'] as const

/**
 * Opening an account, which is two requests pretending to be one.
 *
 * `POST /api/auth/register` answers `201` with a `UserResponse` and no token, so registering
 * does not sign anyone in. Rather than leave a visitor at a second form with the password they
 * just chose, the chain runs here: register, log in with the credentials still in memory, land
 * them wherever they were headed. One submission, as far as they can tell.
 */
export function RegisterPage() {
  const { registerAndSignIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const form = useAuthForm(FIELDS)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()

    void form.submit(async () => {
      try {
        await registerAndSignIn({ name, email, password })
      } catch (error) {
        /*
         * The account exists; only the sign-in that should have followed did not. Telling them
         * registration failed would be false and would walk them into `email_taken` on their
         * own address if they tried again, so they go to the login form with the email filled
         * in and the account's existence stated outright.
         */
        if (error instanceof AccountCreatedButNotSignedIn) {
          navigate(`/login${location.search}`, {
            replace: true,
            state: { email: error.email, accountCreated: true },
          })
          return
        }

        /*
         * `email_taken` is a `409` with no `errors` map — the uniqueness rule lives in
         * `AuthService`, not in DataAnnotations — so it carries no field to put it on. It is
         * unmistakably about the email, so it is placed there by hand rather than left as a
         * banner over a form whose email box looks perfectly fine.
         */
        if (isApiError(error) && error.code === 'email_taken') {
          form.failField('email', copyFor(error).message)
          return
        }

        // Everything else is for `submit` to turn into field errors or a banner.
        throw error
      }

      navigate(returnToFrom(location.search), { replace: true })
    })
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl text-ink">Create an account</h1>

      {form.message !== undefined && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {form.message}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field
          label="Name"
          autoComplete="name"
          required
          minLength={limits.register.nameMin}
          maxLength={limits.register.nameMax}
          value={name}
          onChange={(event) => setName(event.target.value)}
          errors={form.fieldErrors.name}
        />

        <Field
          label="Email"
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
          autoComplete="new-password"
          required
          minLength={limits.register.passwordMin}
          maxLength={limits.register.passwordMax}
          hint={`At least ${limits.register.passwordMin} characters.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errors={form.fieldErrors.password}
        />

        <Button type="submit" disabled={form.submitting}>
          {form.submitting ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Already have an account?{' '}
        <Link to={`/login${location.search}`} className="font-medium text-primary underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
