import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Stands in for a lint rule.
 *
 * The spec for this work asked for an ESLint rule banning UTC conversions; the Vite scaffold
 * ships **oxlint**, and adding a second linter to express one rule is a poor trade. The intent
 * is what matters: nothing in `src/` may convert a wall-clock value to UTC.
 *
 * `toISOString()` converts to UTC. `toJSON()` on a `Date` calls it. Either one, applied to a
 * value that came from the API, posts back a time an hour or two off — the exact bug ADR-0001
 * exists to prevent on the server, reintroduced on the client. `wallClock.ts` keeps its
 * carrier `Date` private precisely so this never becomes tempting.
 *
 * If a genuine need ever arises, add the file to `ALLOWED` with a comment saying why. Do not
 * delete this test.
 */

// From the project root, not from `import.meta.url`: Vite transforms this file, so its
// `import.meta.url` is not a `file:` URL and cannot be converted to a path. Vitest runs with
// the Vite root as the working directory, and the `finds source files` test below fails loudly
// if that ever stops being true.
const SRC = join(process.cwd(), 'src')
const BANNED = [/\.toISOString\s*\(/, /\.toJSON\s*\(/]
const ALLOWED = new Set<string>([
  // This file names the forbidden calls in order to forbid them.
  'lib/noConversions.test.ts',
])

/**
 * The ban is on *calls*, not on prose. `wallClock.ts` explains the `toISOString` trap at
 * length and must keep being able to, so comments come out before the scan — crudely, but
 * crudely is enough for this: the alternative is exempting the one file where a real
 * conversion would do the most damage.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

async function sourceFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found: string[] = []
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(join(dir, entry.name), rel)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(rel)
    }
  }
  return found
}

describe('no UTC conversions in src/', () => {
  it('finds source files to check at all', async () => {
    const files = await sourceFiles(SRC)
    // A guard that silently checks nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(5)
  })

  it('has no call that would convert a wall-clock value to UTC', async () => {
    const files = await sourceFiles(SRC)
    const offenders: string[] = []

    for (const file of files) {
      if (ALLOWED.has(file)) continue
      const text = withoutComments(await readFile(join(SRC, file), 'utf8'))
      for (const pattern of BANNED) {
        if (pattern.test(text)) offenders.push(`${file} matches ${String(pattern)}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
