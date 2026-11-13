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

## Comments

**Implemented.** One refinement to the scope, recorded here because it narrows a sentence this
file and `../spec.md` both state unconditionally.

The scope says: "Any `401` from the wrapper clears the session and redirects to
`/login?returnTo=<path>`." That cannot hold for every `401`, because `POST /api/auth/login`
answers `401` with `invalid_credentials` — verified against a running instance. Taken
literally, an admin who mistyped their own password on `/login` would have their live session
destroyed and be redirected away from the screen holding the message for them.

The rule as built: the two `/auth` routes are marked `anonymous` in the API client, meaning they
carry no session and their `401` says nothing about one. Every request that *does* carry the
session still follows the sentence exactly, including one sent after the session was already
cleared. "Any `401` on a request that carried the session" is the honest wording, and
`web/src/api/client.ts` documents it at the branch.

Two other decisions worth knowing, neither a change of scope:

- The five-minute warning is **derived from the clock**, not scheduled. A forward-only timer
  never warns a visitor who reloads a tab with three minutes left — it signs them out with no
  notice in the window where notice matters most. `sessionStatus` in `web/src/auth/session.ts`
  answers what the session looks like now and when to ask again, so there is no moment to miss,
  and the count falls a minute at a time instead of sitting on its first value.
- Expiry **clears the session and stops**; the route guard then performs the redirect with the
  right `returnTo` for wherever the visitor is. One redirect path rather than two.

All seven "Done when" items now have a test. The four form-level ones — the register-into-login
chain, `email_taken` on the email field, the identical wrong-password copy, and the
register-succeeded-login-failed fallback — are covered by MSW in
`web/src/pages/authForms.test.tsx`, with the handlers typed from the generated schema so a mock
cannot drift from the contract, and the bodies copied from a running instance.

`../spec.md` scopes MSW to the booking page and the admin bookings table in issue 09; this is
MSW on a third screen, which is *more* than it asked for. The spec also says four of this
ticket's acceptance criteria are about those two forms, and nothing else in the plan would ever
have exercised them, so they are tested here rather than left to no one. The shared setup in
`web/src/test/apiMocks.ts` is issue 09's to reuse.

Each of the four was checked by breaking the behaviour it covers and confirming that exactly
the matching test failed — a test that cannot fail would be worse than none.
