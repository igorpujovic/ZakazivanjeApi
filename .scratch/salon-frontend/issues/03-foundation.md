# 03 - Foundation: scaffold, generated types, API client, wall-clock

Status: ready-for-agent
Type: task

Spec: `../spec.md`

Set `web/` up so everything after it has somewhere to live. No screens yet — this issue builds
the three things every screen depends on: the generated contract, the client that speaks it, and
the module that stops JavaScript ruining the salon's clock.

## Scope

- Vite + React + TypeScript in `web/`, deliberately **not** added to `ZakazivanjeApi.sln`.
  Strict TypeScript. Tailwind v4, React Router, TanStack Query wired into an app shell with no
  pages in it yet.
- A dev-server proxy sending `/api` to `http://localhost:5056`, so development is same-origin.
- Type generation: `openapi-typescript` against `/openapi/v1.json` into a committed file, with
  the regeneration command documented as a script. The document is Development-only, so this is
  a dev-time step against a running API, not a build step. Run via `npx` at a pinned version
  rather than as a dependency: it declares `peer typescript@^5.x` and the scaffold installs
  TypeScript 7, and `npx` resolves it in an isolated tree so nothing has to be downgraded or
  forced.
- A post-generation codemod, `scripts/narrow-schema.mjs`, in the same script: collapse the
  `number | string` that .NET emits for every `int32`/`double` down to `number`, and swap the
  branded wall-clock types in for `date-time` and `date`. It must exit non-zero if any rule
  stops matching.
- One hand-written `fetch` wrapper over those types: attaches `Authorization: Bearer <token>`
  when a session exists, parses `ProblemDetails` on any non-2xx, and throws a typed error
  carrying `code`, `detail`, `status` and a `400`'s `errors`.
- The `HandledErrorCode` union from the spec, with raw `code: string` beside it. No committed
  list of every code and no completeness test — the codes are not centralised in C#, so such a
  test could not be honest.
- `wallClock.ts`: branded `WallClockString`, `parse` from explicit components (never
  `new Date(string)`), `format` via `Intl` with `sr-RS`, `toWallClockString` back out. Narrow
  the generated `start` / `end` / `date` positions to the brand.
- A ban on `toISOString` and `toJSON` in `src/`. The scaffold ships **oxlint**, which does not
  implement `no-restricted-syntax`, so this is a test that scans the source tree with comments
  stripped rather than a lint rule — `wallClock.ts` must stay able to explain the trap in prose
  while a real call anywhere fails the suite.
- `limits.ts` mirroring `CatalogueLimits.cs` and the register bounds, commented as a mirror.
- Vitest configured, with the `wallClock` suite running under a forced non-Belgrade `TZ`.
- The six primitives as stubs with real styling: Button, Field, Table, Badge, SlotGrid,
  EmptyState. Radix Dialog and Select copied in shadcn-style.

## Done when

- `npm run dev` serves the shell and `/api/services` reaches the running API through the proxy.
- Regenerating types against a changed DTO makes `tsc` fail at the call sites that no longer
  match.
- A `409` from the API arrives at a call site as a typed error whose `code` narrows in a
  `switch`, with `detail` reachable in the `default`.
- `wallClock` round-trips `"2026-11-20T09:30:00"` unchanged — parse, format, serialise — and the
  suite **fails** if `parse` is switched to `new Date(string)` while `TZ` is not Belgrade.
- A `toISOString()` added anywhere in `src/` fails the test suite, verified against a planted
  violation rather than assumed.
- The codemod reports what it narrowed, and fails rather than passing silently if the generated
  shape changes under it.
- `npm run build`, `npm run lint` and `npm run test` all pass.
