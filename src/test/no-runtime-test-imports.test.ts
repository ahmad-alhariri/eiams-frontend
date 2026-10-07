import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  readSource,
  relativeToRepo,
} from './support/source-scan'

/**
 * The machine-enforced half of EPIC G7's acceptance criterion: "no file under
 * `src/` outside `src/test/` imports `@/test/**`".
 *
 * Why this needs to be enforced rather than stated
 * -----------------------------------------------
 * `src/test/**` is test-support code: inline MSW handlers, factories, the
 * canonical lifecycle engine, architecture-scan helpers. It runs under Vitest
 * with `jsdom` and MSW's Node interceptors, none of which exist in a browser
 * deployment. A production module that imports from it drags that whole tree
 * into the browser bundle, where it is dead weight at best and, for the mock
 * handlers, actively dangerous — a fixture handler reachable from an app chunk
 * is a fixture able to answer a real request.
 *
 * The rule was machine-enforced while it was still broken, which is why each fix
 * was small. Three files reached into the test tree. The component gallery's
 * document demo took the envelope builders from `@/shared/api/`, the fixture
 * builders from `@/shared/fixtures/`, and owns its own copies of the two things
 * that have no non-test home yet (the lifecycle engine and the multipart
 * parser) — fixed in `eiams-frontend-vs8p`. The remaining offender,
 * `eiams-frontend-m4jm`, deleted `src/mocks/` entirely instead of relocating its
 * imports, because there was nothing left to relocate them to: a development
 * mock layer that the app bootstrap can start is a fixture layer, and a fixture
 * layer that has to be kept build-prunable is one line away from answering a
 * real request (it already did, once — see the 517 kB leak recorded in
 * `@/app/boot`). The scan is now GREEN on the real tree, with no allowlist.
 *
 * Why the pattern is a regex and not a module-graph walk
 * -----------------------------------------------------
 * The scan reads raw source on purpose, for two reasons. It must catch the
 * import in a file that is never reached from the entry (an unused module is
 * still a violation, and only a whole-tree scan sees it), and it must work
 * without building anything, so a violation is reported at test time rather
 * than at build time. It matches every syntactic position that can name
 * `@/test`: static `import ... from`, bare `import '@/test/...'` side-effect
 * imports, `export ... from`, and dynamic `import('@/test/...')`.
 *
 * Why the comments do not trigger it
 * ---------------------------------
 * The pattern requires a quote-delimited specifier immediately after an
 * `import`/`export` keyword, so prose that merely mentions the path is not
 * flagged. That is a deliberate trade: this test is a first line of defence
 * that names the offenders, not a substitute for review, and a false positive
 * on a sentence explaining the rule would train people to ignore it.
 *
 * Non-vacuity, per `support/source-scan.ts`
 * -----------------------------------------
 * A scan with an empty file set passes "no offenders" while proving nothing, so
 * `assertScannedFiles` pins the exact count below. The count moves as the tree
 * changes: it dropped by the five files `eiams-frontend-m4jm` deleted from
 * `src/mocks/`, and the change is recorded here rather than absorbed. A drifting
 * count is the signal that the scan's scope was narrowed.
 */

/**
 * Application `.ts`/`.tsx` files under `src/`, excluding `src/test/**` and
 * `*.test.ts(x)`, as produced by `applicationSourceFiles()`.
 *
 * Measured on `eiams-frontend-etf7` (354), re-measured after
 * `eiams-frontend-vs8p` (356), and re-measured again after
 * `eiams-frontend-m4jm` deleted `src/mocks/` (351) — the five files that are
 * gone are `browser.ts`, `db.ts`, `handlers.ts`, `inventory-count-state.ts` and
 * `handlers.test.ts`. (Only four count: `applicationSourceFiles()` already
 * excludes `*.test.ts(x)`, so `handlers.test.ts` was never in this set.)
 * Re-measured at 353 by `eiams-frontend-tqt1`, which added the application file
 * `src/shared/layout/ui-sandbox-marker.tsx` (the shared mount point for the
 * RESOLUTION-040 sandbox marker, mounted both by `AppLayout` and by the
 * anonymous routes).
 * Re-measured at 354 by `eiams-frontend-9uuf`, which added
 * `src/shared/api/transport.ts` — the single production `ApiTransport` instance
 * built from `apiClient`. Re-measured rather than relaxed, per the protocol in
 * this file's header: a scan whose file set drifts silently turns every "no
 * offenders" assertion into a vacuous pass.
 * This file lives in `src/test/`, so adding or editing test files does not move
 * the number; only application code does. `9uuf` also added
 * `src/test/support/test-transport-harness.ts` and two `src/test/**` suites,
 * none of which belong to this set.
 * Re-measured at 358 by `eiams-frontend-q4bv`, which added
 * `src/modules/admin/hooks/use-assignment-scope-selector.ts` - the Arabic
 * scope picker loader for the single role-scope assignment (D-SRS-01), which
 * replaces the raw UUID field the collection editor used.
 */
const SCANNED_FILE_COUNT = 379

/**
 * Any quoted `@/test...` specifier in an import/export position.
 *
 * Three forms, because a production module can reach for test support in three
 * ways and the rule is about the reach, not the syntax:
 *
 *   1. `import … from '@/test/…'` and `export … from '@/test/…'` (the `from`
 *      form, including a multi-line braced import, which is why the prefix is
 *      matched loosely up to `from`);
 *   2. a bare side-effect import, `import '@/test/setup'`;
 *   3. a dynamic import, `await import('@/test/msw/server')`.
 *
 * Each alternative captures the specifier itself (not just the quote) so the
 * failure message can name the module that was reached for. The `/` after
 * `@/test` is not required, so the bare-directory form `@/test` is caught too.
 */
const RUNTIME_TEST_IMPORT =
  /\b(?:import|export)\b[^;'`]*?from\s*(['"])(@\/test[^'"]*)\1|\bimport\s*\(\s*(['"])(@\/test[^'"]*)\3|\bimport\s*(['"])(@\/test[^'"]*)\5/gu

/** The specifier from a `RUNTIME_TEST_IMPORT` match, whichever form matched. */
function specifierOf(match: RegExpExecArray): string {
  return match[2] ?? match[4] ?? match[6] ?? ''
}

/**
 * Files that violated the rule, and how each was resolved.
 *
 * This is guidance, not an expectation, and it is deliberately NOT the value the
 * assertion compares against: an allowlist that the scan is checked against
 * turns a known violation into a passing test, and the epic's criterion is
 * "none", so the assertion below must demand exactly that. Because the array is
 * not what the assertion reads, neither a real fix nor a new violation can be
 * excused by editing it. Every entry below is RESOLVED — there are no open
 * offenders — which is what makes the empty result below a statement about the
 * whole tree rather than about a list.
 */
const OFFENDER_HISTORY: readonly { readonly file: string; readonly resolution: string }[] = [
  {
    file: 'src/app/gallery/demos/document-detail-demo.tsx',
    resolution:
      'FIXED in eiams-frontend-vs8p. The dev-only gallery now builds its three Arabic fixture documents from local builders in a sibling file instead of borrowing the test harness.',
  },
  {
    file: 'src/mocks/db.ts',
    resolution:
      'RESOLVED BY DELETION in eiams-frontend-m4jm — the file no longer exists, so there is nothing left to offend. Relocating the factories to src/shared/fixtures/ had been tried and REVERTED first: src/shared/ is the production layer, so that only moved 39 kB of Arabic fixture data somewhere a production component could import it from. Deleting the consumer was the only option that removed the data instead of relocating it.',
  },
  {
    file: 'src/mocks/handlers.ts',
    resolution:
      'RESOLVED BY DELETION in eiams-frontend-m4jm. errJson/toWireErrorResponse were genuinely relocated to @/shared/api/error-envelope (wire-format knowledge, not fixture data); the factory, lifecycle-engine and multipart imports stayed put rather than being copied, and the file that held them no longer exists.',
  },
]

interface Offender {
  readonly file: string
  readonly specifiers: string[]
}

/** Every application-source file that names `@/test...` in an import position. */
function findOffenders(): Offender[] {
  const offenders: Offender[] = []

  for (const file of applicationSourceFiles()) {
    const source = readSource(file)
    const specifiers = [...source.matchAll(RUNTIME_TEST_IMPORT)].map(specifierOf)

    if (specifiers.length > 0) {
      offenders.push({ file: relativeToRepo(file), specifiers })
    }
  }

  return offenders.sort((a, b) => a.file.localeCompare(b.file))
}

describe('no runtime imports of @/test (EPIC G7)', () => {
  const offenders = findOffenders()

  it('scanned a non-empty, unchanged set of application source files', () => {
    // Non-vacuity. If the glob above ever narrows — a renamed extension, a
    // directory rename, a bad path separator — this fails loudly instead of
    // leaving "no offenders" as a trivially true statement about a few files.
    assertScannedFiles(applicationSourceFiles(), SCANNED_FILE_COUNT)
  })

  it('detects a synthetic @/test import, so the scanner is not inert', () => {
    // The negative control. A pattern that matches nothing makes the scan
    // above pass for the wrong reason, and the passing test above would look
    // like proof. This runs the SAME pattern, on text that definitely violates
    // the rule.
    const synthetic = [
      `import { a } from '@/test/msw/factories'`,
      `import '@/test/setup'`,
      `export { b } from '@/test/msw/envelope'`,
      `const c = await import('@/test/msw/server')`,
    ].join('\n')

    const found = [...synthetic.matchAll(RUNTIME_TEST_IMPORT)]

    expect(found).toHaveLength(4)
  })

  it('does not flag prose that merely mentions the path', () => {
    // The other direction: a rule that fires on its own documentation gets
    // muted, and a muted rule catches nothing.
    const prose = [
      `// no file under src/ outside src/test/ imports @/test/**`,
      ` * see src/test/no-runtime-test-imports.test.ts for the rule`,
      `const path = 'not an import at all'`,
    ].join('\n')

    expect([...prose.matchAll(RUNTIME_TEST_IMPORT)]).toHaveLength(0)
  })

  it('has no application source file importing @/test/**', () => {
    expect(
      offenders.map((offender) => `${offender.file}: ${offender.specifiers.join(', ')}`),
      'Application source must not import the test-support tree (@/test/**). Each file ' +
        'above reached into test-support code and would drag it into the browser bundle, ' +
        'where MSW handlers and factories are dead weight at best and an accidentally ' +
        'reachable fixture is a fixture that can answer a real request.\n' +
        'Resolution history (do NOT add to this to excuse a new import):\n' +
        OFFENDER_HISTORY.map((entry) => `  - ${entry.file}\n      ${entry.resolution}`).join('\n') +
        '\nAnything above that is not a known offender is a NEW violation: fix the import, ' +
        'do not edit this list.',
    ).toEqual([])
  })
})
