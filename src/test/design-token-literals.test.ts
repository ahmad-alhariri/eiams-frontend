import { describe, expect, it } from 'vitest'

import { applicationSourceFiles, readSource, relativeToRepo } from './support/source-scan'

/**
 * A design-system rule that `docs/design-tokens.md` states in prose and that
 * nothing enforced, which the D-OPEN-02 slice violated six times across five
 * commits before this gate existed:
 *
 *   "Do not introduce literal color, spacing, radius, shadow, or animation
 *    values inside feature components where a documented token exists."
 *
 * It also closes the related "feature code must not maintain its own
 * status-color switch statements" gap structurally: a component that owns a
 * tone map is caught here only if it happens to use a literal palette, so the
 * accompanying change moved the warehouse-initialization tones into the shared
 * `StatusBadge` registry rather than leaving a local `TONES` map behind.
 *
 * The companion gate for the duplicate session observer lives in
 * `session-read-path.test.ts`; this file deliberately covers only colour
 * literals so each gate is findable by its own name.
 *
 * Every scan here carries non-vacuity evidence, per `support/source-scan.ts`:
 * an "expect no offenders" assertion over an empty file set proves nothing.
 */

/**
 * A literal Tailwind palette utility: `text-amber-900`, `bg-rose-50`,
 * `border-emerald-300`. Tailwind v4 emits these from the default palette, which
 * is deliberately NOT part of the token set in `src/index.css`; the documented
 * families are the semantic roles (`warning`, `destructive`, `success`,
 * `muted-foreground`, `ring`, ...).
 *
 * Matched on a `-<digits>` shade suffix so `text-warning` and `text-xs` cannot
 * be mistaken for palette hits.
 */
const LITERAL_PALETTE =
  /(?:^|[\s"'`:])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|decoration|divide|accent|caret)-(?:amber|emerald|sky|rose|slate|zinc|gray|neutral|stone|red|orange|lime|green|teal|cyan|blue|indigo|violet|purple|fuchsia|pink|yellow)-\d{2,3}\b/gu

function productionFiles(): string[] {
  return applicationSourceFiles()
}

/**
 * Files whose source matches `pattern`.
 *
 * `support/source-scan.ts` deliberately does not export a shared `offenders`
 * helper: the existing scans each keep a private one because they also need
 * their own allow-marker handling, and a shared version would only be exercised
 * by two call sites. `applicationSourceFiles` already excludes test files and
 * `src/test`, so no filtering happens here.
 */
function filesMatching(pattern: RegExp, files: readonly string[]): string[] {
  return files.filter((file) => {
    // A fresh lastIndex per file: the pattern carries /g, and a shared
    // instance would skip matches on every second file.
    pattern.lastIndex = 0
    return pattern.test(readSource(file))
  })
}

describe('design-token literals in application source', () => {
  it('scans a production file set wide enough for the assertions to mean something', () => {
    const files = productionFiles()
    // A floor rather than an exact pin. The other source gates pin exactly, and
    // every legitimate production file added since has broken one of those pins
    // and turned the failure into noise. This floor still fails loudly if the
    // glob is narrowed to a handful of files, which is the failure mode that
    // matters â€” a "no offenders" pass over an empty scan proves nothing.
    expect(files.length).toBeGreaterThan(300)
  })

  it('no production file uses a literal Tailwind palette utility', () => {
    const found = filesMatching(LITERAL_PALETTE, productionFiles())
    expect(
      found.map(relativeToRepo),
      'use the semantic token family from src/index.css (warning, destructive, success, muted-foreground) instead of a literal palette shade',
    ).toEqual([])
  })

  it('would catch a reintroduced literal palette (non-vacuity)', () => {
    // Reconstruct the exact shape that shipped in the D-OPEN-02 slice.
    const negativeControl = 'className="rounded-md border border-rose-300 bg-rose-50 text-rose-900"'
    expect(LITERAL_PALETTE.test(negativeControl)).toBe(true)
    // And confirm the positive direction: documented tokens do NOT match.
    expect(
      LITERAL_PALETTE.test(
        'className="rounded-md border border-warning/30 bg-warning/10 text-foreground"',
      ),
    ).toBe(false)
  })

  it('reads real Arabic and real tokens through the pattern without mangling them', () => {
    // Guards against a future pattern edit accidentally matching the Arabic
    // copy these same files carry.
    const banner = readSource('src/shared/documents/components/document-scope-read-only-banner.tsx')
    expect(banner).toContain('border-warning/30')
    expect(LITERAL_PALETTE.test(banner)).toBe(false)
  })
})
