import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The other ban, written the same way as `noConversions.test.ts`: nothing a person reads in
 * this application says **delete**.
 *
 * `GLOSSARY.md` lists _deleted_ among the words to avoid for **Active**, because nothing is
 * deleted. Making a service or a stylist inactive **withdraws** it: it leaves the menu, it
 * stays in the catalogue, it stays on every booking already made against it, and it can be put
 * back at any time. A screen saying "delete" would be describing a different application —
 * one an admin would be right to be frightened of.
 *
 * The temptation is real and comes from the wire, which is why this is a test and not a note.
 * The route genuinely is `DELETE /api/services/{id}`, and a developer reaching for the word
 * on a button is one copy-paste away. The catalogue screens assert their own copy
 * (`catalogue/withdrawal.test.ts`, and the rendered-markup check in
 * `pages/adminServicesPage.test.tsx`); this says it about the whole of `src/`, including
 * screens nobody has written yet.
 *
 * Verified against a planted violation: a "Delete" button added to `AdminServicesPage.tsx`
 * fails this test.
 */

const SRC = join(process.cwd(), 'src')

/** Catches delete, Delete, deleted, deleting, deletion — however it is conjugated. */
const BANNED = /delet/i

/**
 * The two places where the word is the wire's and not a person's.
 *
 * `delete` is also a JavaScript keyword and a method on `URLSearchParams`, which is why what
 * is scanned is text rather than source — see {@link readableText}. These two are what is left
 * once that is taken into account: the request method named as a string, and the generated
 * contract. Neither is copy. If a genuine need ever arises, add the file here with a comment
 * saying why — do not delete this test.
 */
const ALLOWED = new Set<string>([
  // `method?: 'GET' | 'POST' | 'PUT' | 'DELETE'`, and the wrapper's own `delete` helper.
  'api/client.ts',

  // The generated OpenAPI types, which describe the API and not the application.
  'api/schema.d.ts',
])

/**
 * The text a person could end up reading: string literals and the words between JSX tags.
 *
 * Scanning the whole source would be scanning the language — `delete left[field]` is the
 * keyword, `params.delete(...)` is the DOM, and `api.delete(...)` is the request this ban is
 * *about*. None of them is a word on a screen, and a check that flagged them would have to be
 * turned off in exactly the files where copy lives.
 *
 * Comments come out first. Prose is allowed to say what the wire does, and has to: explaining
 * why the word stops at the client is most of the point. Same approach as
 * `noConversions.test.ts`, and crude in the same way — enough for a guard, not a parser.
 */
function readableText(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const literals = withoutComments.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? []

  /*
   * Plain text nodes: `>Withdraw it<`, wrapped over as many lines as the prose needs.
   *
   * Anything holding a brace, bracket, parenthesis, semicolon, equals or quote is code and not
   * words — the test is what keeps `Parameters<typeof http.delete>[1]` from reading as a text
   * node, since a `>` and a `<` several lines apart are otherwise indistinguishable from a
   * paragraph. The cost is that a label with brackets in it goes unchecked here; it is still a
   * string literal wherever it is built, and the catalogue screens assert their own markup.
   */
  const jsxText = withoutComments.match(/>[^<>{}()[\];=`'"]+</g) ?? []

  return [...literals, ...jsxText].join('\n')
}

/** Source files only. The tests about this ban have to be able to name the word. */
async function sourceFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found: string[] = []

  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(join(dir, entry.name), rel)))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      found.push(rel)
    }
  }

  return found
}

describe('nothing in the application says delete', () => {
  it('finds source files to check at all', async () => {
    const files = await sourceFiles(SRC)
    // A guard that silently checks nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(5)
  })

  it('has no occurrence of the word in any text a person could read', async () => {
    const files = await sourceFiles(SRC)
    const offenders: string[] = []

    for (const file of files) {
      if (ALLOWED.has(file)) continue

      if (BANNED.test(readableText(await readFile(join(SRC, file), 'utf8')))) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })
})
