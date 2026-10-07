import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  relativeToRepo,
  readSource,
  sourceFilesIn,
  withoutAllowMarkers,
} from '@/test/support/source-scan'
import { join } from 'node:path'

/**
 * Bans the two patterns that hid `eiams-frontend-9uuf` (P0).
 *
 * THE DEFECT. Five services declared their singleton as
 * `createXService({} as any)` and were handed a real transport only by
 * `set*Service(...)` inside tests, so the first runtime list call threw
 * `TypeError: transport.requestPage is not a function`. The suite was green
 * because the tests reached the singleton through a cast —
 * `setCatalogService(bundle.client as unknown as Parameters<...>[0])` — and an
 * `AxiosInstance` has `get/post/put/delete/patch/request` but NOT
 * `requestPage/request/requestEmpty`. The cast satisfied TypeScript and
 * defeated the only check that could have caught the missing wiring. A defect
 * that a cast can silence is a defect that will come back the same way.
 *
 * SCOPE, and why it is narrow. The pattern banned in TESTS is specifically the
 * transport mask — an axios client cast to a transport — not `as unknown as`
 * in general. There are ~25 legitimate `as unknown as` casts in this repo
 * (Vitest mock call tuples, partial factory objects, `window.matchMedia`), and
 * banning the general form would be a rule with a 25-entry allowlist, which is
 * worse than no rule. In PRODUCTION the ban is total: there is no defensible
 * reason for `{} as any` to appear in shipped code at all.
 */

const ALL_SOURCE_FILES = sourceFilesIn(join(process.cwd(), 'src'))
const PRODUCTION_FILES = applicationSourceFiles()

/**
 * This file is excluded from its own file scan, and only this file.
 *
 * The non-vacuity cases below MUST contain the banned pattern verbatim or they
 * would not prove the rule fires. A guard cannot police the fixtures that prove
 * it fires. The exclusion is a named constant in the test that needs it rather
 * than a filter buried in the helper, so a reader sees the carve-out at the
 * point of use and can count it.
 */
const GUARD_SELF_PATH = 'src/test/no-transport-mask.test.ts'

/**
 * Test sources, minus this guard. Compared through `relativeToRepo` because
 * `sourceFilesIn` yields native separators, so a raw `endsWith` on a
 * forward-slash constant silently matches nothing on Windows — an exclusion
 * that excludes nothing is worse than no exclusion, because it looks present.
 */
const TEST_FILES = ALL_SOURCE_FILES.filter((file) => relativeToRepo(file) !== GUARD_SELF_PATH)

/** `{} as any` — the empty-object default that made the singleton inert. */
const EMPTY_OBJECT_CAST = /\{\s*\}\s+as\s+any/u

/**
 * An axios client cast to a transport. Matches the two spellings the defect
 * used: `bundle.client as unknown as Parameters<typeof createXService>[0]` and
 * `bundle.client as unknown as ApiTransport`.
 */
const AXIOS_CAST_TO_TRANSPORT =
  /\bclient\s+as\s+(unknown\s+as\s+)?(ApiTransport|Parameters\s*<[^>]*create[A-Za-z]*Service)/u

/** `transport as any` — the re-widening used by the hook-local warehouse copies. */
const TRANSPORT_AS_ANY = /\btransport\s+as\s+any\b/u

function offenders(pattern: RegExp, files: readonly string[]): string[] {
  return files.filter((file) => {
    const source = withoutAllowMarkers(readSource(file), 'transport-mask')
    // Comments describe the defect in prose; a scan must not match its own
    // documentation, or the guard fails on the day someone explains it.
    const code = source
      .split(/\r?\n/u)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/u.test(line))
      .join('\n')
    return pattern.test(code)
  })
}

describe('no transport masks (eiams-frontend-9uuf)', () => {
  it('scans a pinned set of production and test source files', () => {
    // Pinned, not `> 0`: a narrowed glob leaves a few files rather than none,
    // and every "no offenders" assertion below would then pass silently.
    // 359 = 358 plus this work's src/modules/admin/types/user.types.ts.
    assertScannedFiles(PRODUCTION_FILES, 379)
    expect(TEST_FILES.length).toBeGreaterThan(PRODUCTION_FILES.length)
    expect(TEST_FILES).not.toContain(expect.stringContaining(GUARD_SELF_PATH))
    expect(TEST_FILES.map(relativeToRepo)).not.toContain(GUARD_SELF_PATH)
  })

  it('production code contains no empty-object transport default', () => {
    const found = offenders(EMPTY_OBJECT_CAST, PRODUCTION_FILES)
    expect(found.map(relativeToRepo)).toEqual([])
  })

  it('production code never re-widens a transport to any', () => {
    const found = offenders(TRANSPORT_AS_ANY, PRODUCTION_FILES)
    expect(found.map(relativeToRepo)).toEqual([])
  })

  it('no test casts an axios client to an ApiTransport', () => {
    const found = offenders(AXIOS_CAST_TO_TRANSPORT, TEST_FILES)
    expect(found.map(relativeToRepo)).toEqual([])
  })

  it('the scan would catch the original defect (non-vacuity)', () => {
    // Reconstruct both original shapes verbatim. A guard that cannot reproduce
    // the bug it was written for is decoration.
    const emptyDefault = `let s = createCatalogService({} as any)`
    const axiosCast = `setCatalogService(bundle.client as unknown as Parameters<typeof createCatalogService>[0])`
    const shortCast = `createWarehouseService(bundle.client as unknown as ApiTransport)`
    const reWidened = `warehouseService = createWarehouseService(transport as any)`

    expect(EMPTY_OBJECT_CAST.test(emptyDefault)).toBe(true)
    expect(AXIOS_CAST_TO_TRANSPORT.test(axiosCast)).toBe(true)
    expect(AXIOS_CAST_TO_TRANSPORT.test(shortCast)).toBe(true)
    expect(TRANSPORT_AS_ANY.test(reWidened)).toBe(true)
  })

  it('does not flag the legitimate casts this rule must tolerate', () => {
    // Over-broad rules get disabled, so the false-positive boundary is asserted
    // explicitly: mock tuple reads and partial factory casts stay allowed.
    const legitimate = [
      `const [, body] = mockedPost.mock.calls[0] as unknown as readonly [string, unknown]`,
      `const site = createSite() as unknown as Site`,
      `window.matchMedia = createMatchMedia() as unknown as typeof window.matchMedia`,
      `const transport = createDocumentAttachmentTransport({ post } as unknown as AxiosInstance)`,
    ]
    for (const line of legitimate) {
      expect(AXIOS_CAST_TO_TRANSPORT.test(line)).toBe(false)
      expect(TRANSPORT_AS_ANY.test(line)).toBe(false)
    }
  })
})
