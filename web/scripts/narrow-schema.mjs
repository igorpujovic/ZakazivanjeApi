/**
 * Narrows the generated `src/api/schema.d.ts` after `openapi-typescript` has written it.
 *
 * Two things the generated file gets right but unpleasantly:
 *
 * 1. .NET 11 emits `"type": ["integer", "string"]` with a numeric `pattern` for every
 *    `int32`/`double`, so the generator faithfully produces `id: number | string`. In
 *    practice `System.Text.Json` always writes a JSON number — the schema is merely
 *    permissive — and leaving it as declared would mean `Number(...)` at every use of every
 *    id and price in the application.
 *
 * 2. Dates arrive as `string`. ADR-0001 keeps them local salon wall-clock with no offset,
 *    which JavaScript mishandles in two specific ways (see `src/lib/wallClock.ts`), so they
 *    are branded here and can only be produced by that module. One date is exempt, for the
 *    reason given at `EXEMPT_LINES` below: it is a real instant and not a wall-clock reading.
 *
 * Doing this as a codemod rather than a hand-written second set of types keeps one generated
 * artifact as the single source: regenerating after an API change cannot silently drop the
 * narrowing, because this runs inside `npm run generate:api`.
 *
 * Every rule must match at least once or this exits non-zero. A codemod that quietly stops
 * applying is worse than no codemod — the types would go back to being wrong and nothing
 * would say so.
 */

import { readFile, writeFile } from 'node:fs/promises'

const TARGET = new URL('../src/api/schema.d.ts', import.meta.url)

const IMPORT = `import type { WallClock, WallClockDate } from '../lib/wallClock'\n\n`

/**
 * Comment-driven rules. `openapi-typescript` emits a one-line doc comment naming the format
 * directly above each property, so the format of the line being rewritten is known.
 */
const BY_FORMAT = [
  { format: 'int32', find: /number \| string/g, replace: 'number' },
  { format: 'int64', find: /number \| string/g, replace: 'number' },
  { format: 'double', find: /number \| string/g, replace: 'number' },
  { format: 'decimal', find: /number \| string/g, replace: 'number' },
  { format: 'date-time', find: /\bstring\b/g, replace: 'WallClock' },
  { format: 'date', find: /\bstring\b/g, replace: 'WallClockDate' },
]

/**
 * The generator drops `items.format`, so an array of dates arrives as a bare `string[]` with
 * no comment to key off. `AvailableSlotsResponse.slots` is `IReadOnlyList<DateTime>` in the
 * API and its items really are `format: date-time` in the OpenAPI document — verified
 * against the running API — so it is listed explicitly rather than left unbranded.
 */
const BY_EXACT_LINE = [
  { find: '            slots: string[];', replace: '            slots: WallClock[];' },
]

/**
 * Exemptions, by the exact generated line.
 *
 * `AuthResponse.expiresAt` is the one time in this API that is not wall-clock. It is a
 * `DateTimeOffset` built from `timeProvider.GetUtcNow()` (`JwtTokenService`), so it carries a
 * zone and really is an instant: when the token stops being accepted, not a reading on the
 * salon's wall. ADR-0001 governs the salon's times; a token's death is not one of them.
 *
 * In the OpenAPI document it is `{"type": "string", "format": "date-time"}` — indistinguishable
 * from every `DateTime` in the API, verified against the running document. So the format rules
 * would brand it `WallClock`, and the brand would be a lie that TypeScript then enforces:
 * `asWallClock` rejects an offset, `partsOf` throws on one, and comparing it against
 * `nowWallClock()` compares an instant with a local reading. That lands precisely on the
 * session rule in issue 04 — discard a stored session whose `expiresAt` has passed.
 *
 * It stays `string` and is parsed as an instant with `Date.parse`. That is not the banned
 * conversion: `src/lib/noConversions.test.ts` bans manufacturing UTC out of a zoneless value,
 * and this value carries its zone.
 *
 * Listed rather than skipped silently, so it is counted below like every other rule and this
 * exits non-zero if the API stops emitting the line — which is what should happen, because by
 * then this comment is out of date. Matching is on the whole line, indentation included, so a
 * property of the same name at another depth would not be caught by it.
 */
const EXEMPT_LINES = ['            expiresAt: string;']

const counts = new Map()
const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1)

const source = await readFile(TARGET, 'utf8')
const lines = source.split('\n')
const out = []

let pendingFormat = null

for (const line of lines) {
  const comment = /^\s*\/\*\* Format: ([a-z0-9-]+) \*\/\s*$/i.exec(line)
  if (comment) {
    pendingFormat = comment[1].toLowerCase()
    out.push(line)
    continue
  }

  const exact = BY_EXACT_LINE.find((rule) => rule.find === line)
  if (exact) {
    bump(`line:${exact.find.trim()}`)
    out.push(exact.replace)
    pendingFormat = null
    continue
  }

  if (pendingFormat && EXEMPT_LINES.includes(line)) {
    bump(`exempt:${line.trim()}`)
    out.push(line)
    pendingFormat = null
    continue
  }

  if (pendingFormat) {
    const rule = BY_FORMAT.find((r) => r.format === pendingFormat)
    if (rule && rule.find.test(line)) {
      rule.find.lastIndex = 0
      bump(`format:${rule.format}`)
      out.push(line.replace(rule.find, rule.replace))
      pendingFormat = null
      continue
    }
    pendingFormat = null
  }

  out.push(line)
}

const expected = [
  ...BY_FORMAT.map((r) => `format:${r.format}`),
  ...BY_EXACT_LINE.map((r) => `line:${r.find.trim()}`),
  ...EXEMPT_LINES.map((l) => `exempt:${l.trim()}`),
]

// `int64` and `decimal` are listed defensively: the API does not currently emit either, so
// they are allowed to match nothing. Everything else must have applied.
const mayBeAbsent = new Set(['format:int64', 'format:decimal'])
const missed = expected.filter((key) => !mayBeAbsent.has(key) && !counts.has(key))

if (missed.length > 0) {
  console.error('narrow-schema: these rules matched nothing, so the generated types are')
  console.error('not narrowed as intended. Either the API changed shape or the generator')
  console.error('changed its output — read src/api/schema.d.ts and fix the rules.\n')
  for (const key of missed) console.error(`  - ${key}`)
  process.exit(1)
}

await writeFile(TARGET, IMPORT + out.join('\n'), 'utf8')

const applied = [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, n]) => `${key} ×${n}`)
  .join(', ')

console.log(`narrow-schema: ${applied}`)
