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
    // 380 = 379 plus `src/shared/feedback/reference-limit-note.tsx`, the Arabic
    // directory-cap note added by `eiams-frontend-whhu.14` slice S3.
    // 384 = 380 plus the four Organizations files added by slice S4
    // (`use-organization-mutations.ts`, `organization.schemas.ts`,
    // `organization-form-dialog.tsx`, `organizations-list-page.tsx`).
    // 385 = 384 plus `src/modules/catalog/components/material-status-badge.tsx`,
    // the Arabic status badge the catalog screens render per record.
    // 386 = 385 plus `src/modules/admin/utils/role-labels.ts`, the one resolver
    // that turns a role id into its Arabic label for the users directory, the
    // user detail page and the user form dialog alike (`whhu.17`).
    // `eiams-frontend-whhu.19` rewired the document spine onto the handwritten
    // wire contract and landed on the SAME total: +1 for
    // `src/shared/documents/types/document-action.types.ts` (the closed action
    // vocabulary the policy projection's bare `action: string` is narrowed
    // through) and -2 for the two files it deleted —
    // `src/shared/services/document-attachment-transport.ts` (a second
    // attachment transport, consolidated into
    // `src/shared/documents/document-attachment-service.ts` per
    // `eiams-frontend-71fp`) and the unreferenced
    // `src/shared/documents/types/document-transport.types.ts`. Re-measured, not
    // assumed: an unchanged number here is a coincidence, not "no change".
    // Re-measured at 389 for the D-OPEN-02 warehouse-initialization surface on
    // this branch: `warehouse-initialization-badge.tsx` (`c86e7d8`) and
    // `initialize-warehouse-zero-stock-dialog.tsx` (`68ae09f`). Neither pin
    // moved when those landed, so this gate was red on the branch until now.
    // Then +1 for `use-cached-session.ts`, the consolidated session observer.
    // Then +1 for `opening-initialization.ts`, the D-OPEN-02 initialization rule.
    // Then -1 for the deleted `shared/api/api-error.ts`, a dead second
    // error-copy table keyed on codes the wire never carries.
    // Re-measured at 395 for the Return-module surface added by
    // `return-workflow-frontend-fixes`: the four application files under
    // `src/modules/custody/` (`hooks/use-return-eligible-items.ts`,
    // `components/return-original-issue-selector.tsx`,
    // `components/return-line-asset-selector.tsx`,
    // `pages/return-document-form-page.tsx`). None introduce a `{} as any`,
    // a `client as unknown as ApiTransport` cast, or a `transport as any`,
    // so every banned-pattern assertion below stays green.
    // Then +1 at 396 for `src/shared/api/openapi-drift.ts`, the pure
    // endpoint-discovery and drift-comparison module behind the contract-drift
    // gate; its two `*.test.ts` companions are not application source and do not
    // move this count. It introduces none of the three banned shapes.
    // Re-measured at 398 by `mutable-draft-window` (D-REV-01): +2 for the two
    // application files that un-dead-end a server-created DRAFT document -
    // `src/shared/documents/draft-paper-reference-editor.tsx` and
    // `src/shared/documents/use-document-paper-reference.ts`. The editor is a
    // pure RHF + Zod form backed by TanStack Query; the hook wraps the existing
    // `updatePaperReference` transport exactly the way the other document
    // mutations do. Neither introduces any of the three banned shapes
    // (`{} as any`, `client as unknown as ApiTransport`, `transport as any`),
    // so every banned-pattern assertion below stays green.
    // +3 application files: inventory-count/hooks/use-count-names.ts, inventory-count/components/count-name-fields.tsx, adjustment/hooks/use-count-variance-seeds.ts
    // +3 application files for the live asset/custody wire contract: the two
    // module status badges (`asset/components/asset-status-badge.tsx`,
    // `custody/components/custody-status-badge.tsx`) and the custody status
    // label registry (`custody/custody-status-labels.ts`). They render the
    // live status vocabularies and introduce none of the three banned shapes.
    // +2 application files since 404: `modules/catalog/constants/material-kind-policy.ts`
    // (another workstream's policy module) and
    // `shared/documents/components/serial-capture-field.tsx` (bulk asset serial
    // capture). Neither introduces any of the three banned shapes.
    // -1 since 406: the generated OpenAPI artifact has been deleted, and it was
    // counted as an application file. It never introduced any of the three
    // banned shapes either.
    // Re-measured at 406 on this branch: the number did not move, but the file
    // set did. The reports module swapped `components/dashboard-charts.tsx` for
    // the pure `dashboard-kpis.model.ts` (net 0) and the organization module
    // added `components/organization-page-shell.tsx` (+1), while the audit range
    // types that had their own `modules/audit/types/audit-range.ts` now ride in
    // `modules/audit/types/audit.types.ts` (-1). None of them introduces any of
    // the three banned shapes, so every "no offenders" assertion below stays
    // green.
    // +1 since 406: `config/bundle-budget.ts` (the committed bundle budget) is a new
    // application file. It introduces none of the three banned shapes.
    // +2 since 407: `shared/layout/route-focus-announcer.tsx` (the route focus
    // announcer) and `shared/layout/route-keys.ts` (the route key resolver) are
    // new application files. They read no test support, so the no-offenders
    // assertion below stays green.
    assertScannedFiles(PRODUCTION_FILES, 409)
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
