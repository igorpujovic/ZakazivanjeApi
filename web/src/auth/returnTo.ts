/**
 * Where to send someone back to after they sign in.
 *
 * A guard that redirects to `/login` and then dumps you on the landing page has lost your
 * place; a `401` mid-session that does the same has lost your place *and* whatever you were
 * doing. So the path travels in the query string and comes back out again.
 *
 * It travels through a URL, which means it is attacker-controlled on the way back in. That is
 * handled here rather than at each call site, because there are three — both guards and the
 * `401` handler — and one of them forgetting would be the whole of the problem.
 */

/** Just the parts of `Location` this needs, so it is testable without a router. */
export interface PathAndSearch {
  pathname: string
  search: string
}

const PARAM = 'returnTo'

/** The pages there is no point coming back to: you were only passing through. */
const NOT_WORTH_RETURNING_TO = new Set(['/login', '/register'])

export function loginPathFor(location: PathAndSearch): string {
  if (NOT_WORTH_RETURNING_TO.has(location.pathname)) return '/login'

  const target = `${location.pathname}${location.search}`
  return `/login?${PARAM}=${encodeURIComponent(target)}`
}

/**
 * Whether a value is a path inside this application, and not a way out of it.
 *
 * Must start with a single `/`. `//evil.test` and `/\evil.test` are both protocol-relative
 * URLs that browsers follow off-site, and `https://evil.test` and `javascript:` need no
 * explanation — the point of the check is that a believable salon login page must not be
 * usable as a step in somebody else's phishing flow.
 */
function isInternalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
}

/** The path to return to, or the menu if there is not a safe one. */
export function returnToFrom(search: string): string {
  const requested = new URLSearchParams(search).get(PARAM)

  if (requested === null || requested === '') return '/'

  return isInternalPath(requested) ? requested : '/'
}
