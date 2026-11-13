# 01 - API: a CORS policy with origins from configuration

Status: ready-for-agent
Type: task

Spec: `../spec.md`

The API configures no CORS at all today. The Vite dev server proxies `/api`, so development
never exercises it — but an API that only works from a browser behind a proxy is not honestly
consumable from one, and the proxy hides the problem rather than solving it. This is an API
change, in the frontend's directory because it exists only to serve the frontend.

## Scope

- A named CORS policy registered in `Program.cs`, applied with `UseCors` in the right place in
  the pipeline: after routing, before authentication and authorization.
- Allowed origins bound from configuration, not hard-coded. An `Cors:AllowedOrigins` array,
  defaulted in `appsettings.Development.json` to the Vite origin (`http://localhost:5173`).
- Allow the methods and headers the frontend actually sends — `GET`, `POST`, `PUT`, `DELETE`,
  and `Authorization` and `Content-Type` — rather than a blanket `AllowAnyHeader` /
  `AllowAnyMethod`.
- No `AllowCredentials`: the session is a bearer token in a header, not a cookie, so credentials
  are not needed and enabling them would forbid wildcard origins for nothing.
- An empty or absent origin list is a valid configuration meaning "no cross-origin callers", and
  must not fail the boot — unlike `WorkingHours`, this is not a malformed-value case.

## Done when

- A preflight `OPTIONS` to `/api/services` from the configured origin answers `204` with the
  expected `Access-Control-Allow-*` headers.
- A request from an origin not in the list is refused by the browser, and the API does not emit
  an allow header for it.
- Running with no `Cors:AllowedOrigins` configured starts normally.
- An authenticated cross-origin `GET /api/bookings/my` succeeds with the `Authorization` header
  surviving preflight.
- The README's setup section mentions the key alongside the existing configuration table.
