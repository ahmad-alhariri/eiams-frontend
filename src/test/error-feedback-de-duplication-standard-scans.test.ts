import { describe, expect, it } from 'vitest'
import {
  applicationSourceFiles,
  assertScannedFiles,
  assertAllowlistIsSmall,
  readSource,
  withoutAllowMarkers,
  allowMarkersIn,
  relativeToRepo,
} from './support/source-scan'

function detailArGuardOffenders(source: string): string[] {
  const hits: string[] = []
  const lines = source.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] as string).includes('toast.error(')) {
      // multi-line window: look ahead up to 12 lines for the detailAr guard
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        if (
          (lines[j] as string).includes('detailAr') &&
          (lines[j] as string).includes('=== null')
        ) {
          hits.push(`line ${i + 1}->${j + 1}: ${(lines[i] as string).trim().slice(0, 60)}`)
          break
        }
      }
    }
  }
  return hits
}

describe('error-feedback-de-duplication-standard-scans', () => {
  // Normalize to repo-relative forward-slash paths so filters work on Windows.
  const SCANNED = applicationSourceFiles()
    .map(relativeToRepo)
    .filter(
      (f) =>
        (f.startsWith('src/modules/') || f.startsWith('src/shared/')) &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.test.tsx') &&
        !f.startsWith('src/shared/ui/toast-manager'),
    )

  // Pin count so a broken/narrowed glob cannot silently pass.
  const EXPECTED_SCANNED_FILES = 369
  assertScannedFiles(SCANNED, EXPECTED_SCANNED_FILES)

  // Fence 1 — only api-error.ts may build the toast.error({ title, ...(detailAr === null ? {} : { description }) }) shape
  it('Fence 1: no production module outside api-error.ts builds the detailAr-guarded toast.error shape', () => {
    const offenders: string[] = []
    const allowedFiles = new Set([
      'src/shared/services/api-error.ts',
      'src/shared/api/error-copy-ar.ts',
    ])
    for (const file of SCANNED) {
      if (allowedFiles.has(file)) continue
      const raw = readSource(file)
      const src = withoutAllowMarkers(raw, 'standard-scans')
      const hits = detailArGuardOffenders(src)
      if (hits.length > 0) {
        offenders.push(`${file}: ${hits.join('; ')}`)
      }
    }
    // Synthetic positive control: detector MUST fire on the forbidden shape
    const syntheticOffender = `toast.error({\n  title: apiError.titleAr,\n  ...(detailAr === null ? {} : { description: detailAr })\n})`
    expect(detailArGuardOffenders(syntheticOffender).length).toBeGreaterThan(0)
    // Synthetic negative control: compliant code must NOT fire
    const compliant = `toast.error({ title: 'x', description: 'y' })`
    expect(detailArGuardOffenders(compliant).length).toBe(0)
    expect(offenders).toEqual([])
  })

  // Fence 2 — shared constant defined exactly once, only in api-error.ts
  it('Fence 2: CONFLICT_GUIDANCE_AR defined exactly once in api-error.ts', () => {
    const defs: string[] = []
    for (const file of SCANNED) {
      const raw = readSource(file)
      const src = withoutAllowMarkers(raw, 'standard-scans')
      if (/(?<![A-Z_])CONFLICT_GUIDANCE_AR\s*=/.test(src)) {
        defs.push(file)
      }
    }
    const syntheticDef = `const CONFLICT_GUIDANCE_AR = 'test'`
    expect(/(?<![A-Z_])CONFLICT_GUIDANCE_AR\s*=/.test(syntheticDef)).toBe(true)
    const compliantDomain = `export const ADJUSTMENT_CONFLICT_GUIDANCE_AR = 'x'`
    expect(/(?<![A-Z_])CONFLICT_GUIDANCE_AR\s*=/.test(compliantDomain)).toBe(false)
    const compliantOther = `const OTHER = 'x'`
    expect(/(?<![A-Z_])CONFLICT_GUIDANCE_AR\s*=/.test(compliantOther)).toBe(false)
    expect(defs.length).toBe(1)
    expect(defs[0]).toBe('src/shared/services/api-error.ts')
  })

  // Non-vacuity: the scan actually looked at files.
  it('scan set is non-empty and pinned above 100', () => {
    expect(SCANNED.length).toBeGreaterThan(0)
    expect(SCANNED.length).toBe(EXPECTED_SCANNED_FILES)
    expect(EXPECTED_SCANNED_FILES).toBeGreaterThan(100)
  })

  // Fence 3 — exactly one reportApiError production definition, in api-error.ts
  it('Fence 3: exactly one export function reportApiError, in api-error.ts', () => {
    const hits: string[] = []
    for (const file of SCANNED) {
      const raw = readSource(file)
      const src = withoutAllowMarkers(raw, 'standard-scans')
      if (/export function reportApiError/.test(src)) {
        hits.push(file)
      }
    }
    expect(hits.length).toBe(1)
    expect(hits[0]).toBe('src/shared/services/api-error.ts')
    // Synthetic positive / negative controls for detector
    expect(/export function reportApiError/.test('export function reportApiError() {}')).toBe(true)
    expect(/export function reportApiError/.test('function helper() {}')).toBe(false)
  })

  // Guard non-vacuity of the allow-list itself
  it('allowlist is small', () => {
    const allMarkers = SCANNED.flatMap((f) => {
      const raw = readSource(f)
      return allowMarkersIn(raw)
    })
    assertAllowlistIsSmall(allMarkers, 10)
  })
})
