# 04 - Auth: login, register, the session, route guards

Status: ready-for-agent
Type: task
Blocked by: 03

Spec: `../spec.md`

Sign-in, account creation, and the session every guarded screen reads. The API issues a bearer
token with a 60-minute life and no refresh (ADR-0006), so the frontend's job is to hold it for
exactly as long as it is useful and to end the session cleanly rather than let a dead token
produce mystery failures.

## Scope

- `/login` and `/register`. Native input constraints from `limits.ts`; server `errors` mapped
  onto fields as the backstop.
- The session as one `sessionStorage` object, `{ accessToken, expiresAt, user }`. Parsed on
  startup and **discarded if `expiresAt` has passed**, so no known-dead token is ever sent.
- One timer: a warning at five minutes remaining, session cleared at expiry.
- Any `401` from the wrapper clears the session and redirects to `/login?returnTo=<path>`.
- Register chains into login: `POST /api/auth/register` returns `201` with a `UserResponse` and
  no token, so the form posts register, then login with the credentials already in memory, then
  lands the user at `returnTo`. Register-succeeded-login-failed falls back to `/login` with the
  email prefilled and an explicit "your account was created, please sign in".
- Route guards: `/book` and `/bookings` need a session; `/admin/*` needs
  `user.role === "Admin"`. A client who reaches `/admin/*` gets a plain "not for you", not a
  redirect loop.
- The shell's navigation renders from `user.role` — no JWT decoding anywhere.
- `invalid_credentials` gets its own copy; everything else falls through to `detail`.

## Done when

- Registering, then being signed in and returned to where you started, is one form submission.
- A wrong password shows the login screen's own message, identical whether the email exists —
  the API answers the same way on purpose and the UI does not undermine it.
- Registering an existing email surfaces `email_taken` on the email field.
- Reloading the page keeps you signed in; closing the tab does not.
- A session stored with a past `expiresAt` is gone on startup, with no request sent.
- Pasting `/admin/bookings` as a client is refused, and as an admin works.
- A `401` mid-session returns you to login and brings you back to the same path after signing in.
