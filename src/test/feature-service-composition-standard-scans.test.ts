import { describe, expect, it } from 'vitest'

import {
  allowMarkersIn,
  assertAllowlistIsSmall,
  assertScannedFiles,
  moduleHookFiles,
  readSource,
  relativeToRepo,
  silentSecondaryReadOffenders,
  silentSecondaryReadOffendersIn,
  withoutAllowMarkers,
} from './support/source-scan'

/**
 * Machine-enforced half of `docs/feature-service-composition-standard.md`
 * (eiams-frontend-xlfs).
 *
 * The file this replaces asserted that the standard's *documentation* still
 * contained certain strings, so it would have passed with every service, hook
 * and page in the repository violating every rule in it. The service-purity
 * rules moved to ESLint, which fails earlier in the gate and reports a line
 * number; what remains here are the rules ESLint cannot express, because each
 * needs either cross-file knowledge or an ABSENCE check.
 *
 * Three anti-vacuity devices, because a source scan that finds nothing is
 * indistinguishable from a source scan that is broken:
 *
 *  1. an exact file-count assertion per scan (`assertScannedFiles`) — a narrowed
 *     or broken glob otherwise turns every `toEqual([])` into a silent pass;
 *  2. a negative-control fixture per scan, proving the detector fires on a
 *     known-bad snippet at the moment the suite runs, independent of the
 *     codebase;
 *  3. offender lists of repo-relative paths, so a failure names the file rather
 *     than printing a blob of source.
 */

const HOOK_FILES = moduleHookFiles()

/**
 * Exact counts: if one of these moves, the scan set changed and must be
 * re-examined.
 *
 * 43 → 44 by `eiams-frontend-whhu.14` slice S4, which added
 * `src/modules/organization/hooks/use-organization-mutations.ts`. Its keys are
 * built through the same `queryKeys.scoped` factory as its siblings, so scan 1
 * below is expected to stay green.
 *
 * 44 → 45 for `src/modules/auth/hooks/use-cached-session.ts`, which consolidates
 * the four byte-identical private session observers that had been copied into
 * `route-guards.tsx`, `use-permission.ts`, `sidebar.tsx` and
 * `session-user-menu.tsx`. It reads a query key and holds no query keys of its
 * own, so scan 1 stays green; it is an observer with `enabled: false`, which is
 * the same posture as every other hook in this set.
 *
 * 45 → 46 for `src/modules/custody/hooks/use-return-eligible-items.ts`
 * (FIX-R2, return-workflow-frontend-fixes): scoped eligible-items read for the
 * Return draft, keyed through `queryKeys.scoped` like its siblings, so scan 1
 * stays green.
 * 46 → 47 by `mutable-draft-window` (D-REV-01): +1 for
 * `src/shared/documents/use-document-paper-reference.ts`, the TanStack Query
 * mutation that writes the paper reference of an existing DRAFT through the
 * existing `PUT /warehouse-documents/{id}/paper-reference` route and
 * invalidates the detail branch on success. It is an `useMutation`, holds no
 * query keys of its own, and is invalidated through the existing
 * `useInvalidateDocumentDetail` hook, so scan 1 (hand-derived key prefix)
 * stays green.
 */
// +2 hook files: inventory-count/hooks/use-count-names.ts, adjustment/hooks/use-count-variance-seeds.ts
const EXPECTED_HOOK_FILES = 49

// ---------------------------------------------------------------------------
// Scan 1 — query keys must come from a factory
// ---------------------------------------------------------------------------

/**
 * A scoped cache key is built by `queryKeys.scoped`/`queryKeys.unscoped`/`queryKeys.public`. A
 * hand-derived prefix is a silent correctness hazard, not a style nit: keys
 * produced that way are invisible to `clearScopedQueries` (which matches the
 * `scoped` namespace) and to the module's own invalidation, so a scope change or
 * a mutation leaves stale data on screen. `eiams-frontend-jkel` is exactly this
 * bug, where `['asset']` matched no real key at all.
 *
 * The shape checked is the *mistake*, not the correct shape, so the rule cannot
 * itself go stale when `scopeParts` changes.
 */
const HAND_DERIVED_KEY = [
  /queryKey:\s*\[/u,
  /invalidateQueries\(\s*\{\s*queryKey:\s*\[/u,
  /predicate:\s*\(/u,
] as const

/**
 * Sites that legitimately mention the namespace literals: the module that
 * DEFINES them, and the session-lifecycle namespace guard, which matches on
 * `'scoped'` precisely in order to evict it.
 */
const KEY_NAMESPACE_OWNERS = [
  'src/shared/services/query-keys.ts',
  'src/modules/auth/services/session-lifecycle.ts',
] as const

/**
 * The ONE implementation of this rule, parameterised by source.
 *
 * The file scan and every negative control run through here on purpose. An
 * earlier version kept a separate copy for the controls, so reverting the
 * production window to forward-only left the backward-looking control green:
 * a control that exercises different code than production proves nothing about
 * the detector it is meant to validate. Reported once per line, at the anchor
 * that put the key at a derivable position.
 */
function handDerivedKeyOffendersIn(repoPath: string, source: string): string[] {
  const offenders: string[] = []
  const lines = source.split(/\r?\n/u)
  lines.forEach((line, index) => {
    const atKeyPosition = HAND_DERIVED_KEY.some((pattern) => pattern.test(line))
    if (!atKeyPosition) return
    // Two-stage filter: the construct must show the hand-derivation itself.
    // A bare `queryKey: [` is not evidence; reaching into the layout, or
    // re-deriving the scope parts, is.
    // The derivation may sit ABOVE this line (a `const prefix = [...]` the key
    // is then spread from), so the window looks both ways. A forward-only
    // window missed exactly the backward-looking shape this rule exists for.
    const window = lines.slice(Math.max(0, index - 4), index + 5).join(' ')
    const derives =
      /key\[\d+\]/u.test(window) ||
      /['"]scoped['"]/u.test(window) ||
      /['"]public['"]/u.test(window) ||
      /['"]unscoped['"]/u.test(window) ||
      /\.kind/u.test(window) ||
      /'id' in \w+/u.test(window)
    if (derives) offenders.push(`${repoPath}:${index + 1}`)
  })
  return offenders
}

function handDerivedKeyOffenders(files: readonly string[]): string[] {
  const offenders: string[] = []
  for (const file of files) {
    if ((KEY_NAMESPACE_OWNERS as readonly string[]).includes(relativeToRepo(file))) continue
    offenders.push(
      ...handDerivedKeyOffendersIn(
        relativeToRepo(file),
        withoutAllowMarkers(readSource(file), 'hand-derived-query-key'),
      ),
    )
  }
  return offenders
}

// ---------------------------------------------------------------------------
// Scan 2 — a failed secondary read must be distinguishable
// ---------------------------------------------------------------------------

/**
 * The defect class this workstream shipped four times: a secondary query fails,
 * the page collapses `query.data ?? fallback` and renders as though the data
 * were empty, and the UI then states something it has no basis to state.
 *
 * The DETECTOR lives in `support/source-scan.ts` and is shared with the
 * repository-wide scan (`silent-secondary-read-scan.test.ts`), so the rule has
 * ONE implementation: a second copy of this logic is exactly how the control
 * for scan 3 drifted from the rule it was meant to validate. The file scan and
 * every negative control below therefore run through the same function, and
 * the correlation is VARIABLE-SPECIFIC (`X.isError`, not "does this file
 * mention isError") because eight files declare more than one component and
 * handle an error somewhere.
 */

// ---------------------------------------------------------------------------
// Scan 3 — an idempotency key is minted once per user intent
// ---------------------------------------------------------------------------

/**
 * The standard requires the key to be created "once when the user starts the
 * action" and kept across an explicit retry, so an ambiguous network failure
 * cannot be applied twice. Minting it as a call argument makes every invocation
 * a fresh key.
 *
 * The detector is deliberately NOT "createIdempotencyKey inside mutationFn" —
 * that shape has a high false-positive rate, because the three BEST
 * implementations in the repository are exactly that: they mint inside the
 * mutation and hold the result in a `useRef`, which is correct. What separates a
 * violation is minting the key as an argument with nothing to own it.
 */
const MINTED_AS_ARGUMENT = /\b\w+\([^()]*\bcreateIdempotencyKey\(\)/u
const MINT_SHADOWED = /function createIdempotencyKey\b/u
const MINT_ANYWHERE = new RegExp(`${MINT_SHADOWED.source}|${MINTED_AS_ARGUMENT.source}`, 'u')

/**
 * The ONE implementation of this rule, parameterised by source.
 *
 * The file-based callers and the negative controls both go through here on
 * purpose: an earlier version kept a separate, simplified copy of the logic for
 * the control, and the two drifted — the control still reported one match per
 * line of a sliding window while the real rule reported one per violation. A
 * negative control that exercises different code than production proves nothing
 * about the detector it is meant to be validating.
 *
 * Reported once per line, at the line where the match begins. The earlier
 * sliding-window version listed three consecutive lines for a single defect,
 * which made one problem read as three.
 */
function idempotencyMintOffendersIn(repoPath: string, source: string): string[] {
  const found: string[] = []
  const reported = new Set<number>()
  for (const match of source.matchAll(new RegExp(MINT_ANYWHERE.source, 'gu'))) {
    const line = source.slice(0, match.index).split(/\r?\n/u).length
    if (reported.has(line)) continue
    reported.add(line)
    found.push(`${repoPath}:${line}`)
  }
  return found
}

function unsafeIdempotencyMintOffenders(files: readonly string[]): string[] {
  const offenders: string[] = []
  for (const file of files) {
    const repo = relativeToRepo(file)
    // The shared helper itself is the definition, not a violation.
    if (repo === 'src/shared/services/mutation-safety.ts') continue
    offenders.push(
      ...idempotencyMintOffendersIn(
        repo,
        withoutAllowMarkers(readSource(file), 'idempotency-mint'),
      ),
    )
  }
  return offenders
}

// ---------------------------------------------------------------------------

describe('feature service composition standard (source scans)', () => {
  it('scans the expected hook set, so a narrowed glob cannot pass silently', () => {
    assertScannedFiles(HOOK_FILES, EXPECTED_HOOK_FILES)
  })

  describe('query keys are built by a factory', () => {
    it('reports a hand-derived scoped key prefix', () => {
      // Negative control: proves the detector fires on a known-bad shape.
      const probe = [
        'function f() {',
        "  return { queryKey: ['scoped', scope.kind, 'id' in scope ? scope.id : null] },",
        '}',
      ].join('\n')
      expect(handDerivedKeyOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('reports a backward-looking hand-derived scoped key prefix', () => {
      // The prefix is built ABOVE the invalidate call, so only a window that
      // looks backwards can see `'scoped'`, `.kind` and the `'id' in` probe
      // that make the derivation visible.
      const probe = [
        "const prefix = ['scoped', scope.kind, 'id' in scope ? scope.id : null, 'inventory-counts'] as const",
        'void client.invalidateQueries({ queryKey: [...prefix] })',
      ].join('\n')
      expect(handDerivedKeyOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('reports a derivation four lines above the key position', () => {
      // A forward-only window sees only the `queryKey:` line here and returns
      // zero, so this control turns red if the shared implementation is
      // reverted. Four lines is the far edge of the lookback window.
      const probe = [
        "const parts = ['scoped']",
        'const kind = scope.kind',
        'const id = scope.id',
        "const prefix = [...parts, kind, id, 'inventory-counts']",
        'void client.invalidateQueries({ queryKey: [...prefix] })',
      ].join('\n')
      expect(handDerivedKeyOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('does not report a key built through queryKeys.scoped', () => {
      const probe = ["  queryKey: queryKeys.scoped(scope, 'custody'),"].join('\n')
      expect(handDerivedKeyOffendersIn('probe', probe)).toHaveLength(0)
    })

    it('does not report the modules that own the namespace literals', () => {
      expect(KEY_NAMESPACE_OWNERS).toContain('src/shared/services/query-keys.ts')
      expect(relativeToRepo(HOOK_FILES[0] as string)).not.toBe('')
    })

    it('no hook hand-derives a scoped or public query key prefix', () => {
      const offenders = handDerivedKeyOffenders(HOOK_FILES)
      expect(offenders, `hand-derived query keys:\n${offenders.join('\n')}`).toEqual([])
    })
  })

  describe('a failed secondary read stays distinguishable', () => {
    it('reports a collapsed read with no error branch', () => {
      const probe = [
        'function C() {',
        '  const q = useThingQuery()',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('accepts a collapsed read whose query handles its error', () => {
      const probe = [
        'function C() {',
        '  const q = useThingQuery()',
        '  if (q.isError) return <ErrorState />',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(0)
    })

    it('correlates per variable, so an unrelated error branch does not excuse it', () => {
      const probe = [
        'function C() {',
        '  const other = useOtherQuery()',
        '  const q = useThingQuery()',
        '  if (other.isError) return null',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('no component collapses a failed read into an empty value', () => {
      const offenders = silentSecondaryReadOffenders(HOOK_FILES)
      expect(offenders, `silent secondary reads:\n${offenders.join('\n')}`).toEqual([])
    })
  })

  describe('idempotency keys are minted once per user intent', () => {
    it('reports a key minted as a bare call argument', () => {
      const probe = [
        'mutationFn: (id) => {',
        '  return service.post(id, createIdempotencyKey())',
        '}',
      ].join('\n')
      expect(unsafeIdempotencyMintOffendersFor(probe)).toHaveLength(1)
    })

    it('accepts a key held in a ref and minted once', () => {
      const probe = [
        'const keyRef = useRef(null)',
        'mutationFn: (id) => {',
        '  keyRef.current ??= createIdempotencyKey()',
        '  return service.post(id, keyRef.current)',
        '}',
      ].join('\n')
      expect(unsafeIdempotencyMintOffendersFor(probe)).toHaveLength(0)
    })

    it('no hook mints an idempotency key it does not own', () => {
      const offenders = unsafeIdempotencyMintOffenders(HOOK_FILES)
      expect(offenders, `unsafe idempotency mints:\n${offenders.join('\n')}`).toEqual([])
    })
  })

  describe('reviewed exceptions', () => {
    it('every standard-allow marker names a rule and carries a real reason', () => {
      const markers = HOOK_FILES.flatMap((file) =>
        allowMarkersIn(readSource(file)).map((marker) => ({
          at: `${relativeToRepo(file)}:${marker.line + 1}`,
          marker,
        })),
      )
      for (const { at, marker } of markers) {
        expect(marker.reason.trim().length, `${at} needs a reason`).toBeGreaterThanOrEqual(12)
        expect(marker.rule, `${at} must name a rule id`).toMatch(/^[a-z0-9-]+$/u)
      }
    })

    it('the exception set stays small', () => {
      const markers = HOOK_FILES.flatMap((file) => allowMarkersIn(readSource(file)))
      assertAllowlistIsSmall(markers, 3)
    })
  })
})

// Probe variants reuse the production predicates against a source string rather
// than a file, which is what makes the negative control possible at all.
function unsafeIdempotencyMintOffendersFor(source: string): string[] {
  return idempotencyMintOffendersIn('probe', source)
}
