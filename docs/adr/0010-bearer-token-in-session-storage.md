# The bearer token is held in sessionStorage

The frontend keeps `{ accessToken, expiresAt, user }` under one `sessionStorage` key,
`salon.session`. It is read once at startup, discarded unread if `expiresAt` has already
passed, and sent as `Authorization: Bearer <token>` by the one fetch wrapper. A `401` from any
request clears it and redirects to `/login?returnTo=<path>`.

The orthodox answer is an `httpOnly` cookie, which JavaScript cannot read and an XSS therefore
cannot steal. **It was not available to choose.** The API is bearer-only: `JwtTokenService`
hands the token back in the `AuthResponse` body, nothing sets a cookie, nothing reads one, and
the CORS policy allows no credentials. Picking the cookie would have meant changing the API's
authentication — a cookie, a CSRF defence to go with it, and an answer for Scalar, which drives
the same endpoints by pasting a token into a box. The frontend's remit was two API changes
(CORS, and admin visibility of inactive rows); reversing ADR-0006's authentication was not one
of them, and a frontend wanting a nicer storage story is not grounds to reopen it.

Given a token that must live in JavaScript's reach, the choice was among three places.
`localStorage` survives the browser being closed, which is worse than useless for a credential
that dies in sixty minutes with no refresh: it leaves the token on a shared machine's disk long
after the visitor meant to be signed in, and buys durability that the expiry has already
capped. Memory alone is the safest and loses the session on every refresh, which for a
sixty-minute token with no refresh path means being thrown out by pressing F5 — and it would
make a client lose a half-filled booking form to a stray reload. `sessionStorage` survives a
refresh, dies with the tab, and is readable by nothing on another origin.

## Consequences

**An XSS in this application is a stolen session.** That is the cost of the cookie not being
available, and it is not mitigated away by anything here. What narrows it is only that the
attack surface is small and deliberately kept so: React escapes interpolated text, there is no
`dangerouslySetInnerHTML` anywhere in `src/`, `index.html` loads no third-party script, and
nothing renders API prose as markup. A future feature that renders HTML from data would make
this decision materially worse and should be read as a reason to revisit it.

The token is also visible in devtools, which is a disclosure on a shared screen and nothing
more — it is the same string Scalar asks a reader to paste by hand.

**ADR-0006's missing refresh tokens are absorbed here rather than argued with.** The session
knows when it dies, so the application never sends a token it already knows is dead, and one
timer warns at five minutes remaining and clears the session at expiry. A client is told their
session is about to end while they can still do something about it, instead of discovering it
from a booking that fails. The honest limit: five minutes' notice is not a refresh. Someone who
walks away mid-booking comes back signed out, and the only remedy the API offers is logging in
again. `returnTo` is what makes that cheap — they land back on the page they were on.

Nothing decodes the JWT. The role comes from `user.role` in the login response, because a
client-side claim read is not a security boundary and the API checks the token on every request
regardless; the token is an opaque string to this application, exactly as it is to a browser.

A tab is a session: one opened fresh starts signed out, and signing out in one leaves a tab
that already had its own copy holding it until that copy’s next request — which is not a bug
being tolerated but the behaviour `sessionStorage` was chosen for, and it is why a `401`
anywhere clears the session rather than only the screen that provoked it.
