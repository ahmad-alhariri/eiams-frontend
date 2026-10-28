/**
 * Contract smoke — coverage item 8: Arabic error-copy coverage, TABLE-DRIVEN.
 * Runs LAST (file ordering) so the shared wire-code registry has collected
 * every code the whole suite observed on the live wire.
 *
 * For every code observed live, the contract is: the code either has approved
 * Arabic copy in `src/shared/api/error-copy-ar.ts` OR is listed in
 * `docs/error-copy-ar-backlog.md` (the reviewed fallback backlog, every row
 * carrying its defining backend `file.cs:line`). A code that is neither is a
 * genuine frontend divergence and this test fails with it.
 *
 * Also asserted on REAL wire responses through the frontend's own
 * `normalizeApiError`: the 400 `USERS_INVALID_REFRESH_TOKEN` and the 403
 * `REFRESH_TOKEN_ORIGIN_REJECTED` both render Arabic titles that never contain
 * the English wire message or code.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { arabicCopyForCode, KNOWN_ERROR_CODES } from '@/shared/api/error-copy-ar'
import { normalizeWireErrorCode } from '@/shared/api/envelope'
import { normalizeApiError } from '@/shared/services/api-error'
import { apiClient } from '@/shared/services/api.client'
import { collectedWireCodes } from './contract-wire-codes'
import { withoutCookie } from './session-cookie-jar'
import './contract-api-base'

/**
 * Codes the reviewed backlog admits, parsed from its table rows: a row starts
 * with `| \`CODE\`` AND carries its defining backend site (`file.cs:line`).
 */
function backlogCodes(): Set<string> {
  const text = readFileSync(resolve(process.cwd(), 'docs', 'error-copy-ar-backlog.md'), 'utf8')
  const codes = new Set<string>()
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith('| `') || !line.includes('.cs:')) {
      continue
    }
    const match = /\| `([A-Z0-9_]+)`/u.exec(line)
    if (match !== null && match[1] !== undefined) {
      codes.add(match[1])
    }
  }
  return codes
}

/** Long Latin runs are wire code/message residue — Arabic-first UI copy must not carry them. */
function latinRun(title: string): string | null {
  const match = /[A-Za-z_]{4,}/u.exec(title)
  return match === null ? null : match[0]
}

describe('contract-smoke: Arabic error-copy coverage', () => {
  // The observed-code assertion below can only be meaningful if at least one
  // REAL wire code has been collected. These two probes run before every test
  // in this file, so the shared registry always carries
  // USERS_INVALID_REFRESH_TOKEN and REFRESH_TOKEN_ORIGIN_REJECTED whatever
  // order the files execute in. The failures are swallowed on purpose: the
  // shared interceptor records the wire code before it rethrows, and the
  // assertions on the outcomes live in the tests below.
  beforeAll(async () => {
    await apiClient.post('/auth/refresh', undefined, withoutCookie({})).catch(() => undefined)
    await apiClient
      .post('/auth/refresh', undefined, { headers: { Origin: 'http://evil.origin' } })
      .catch(() => undefined)
  })
  it('every KNOWN_ERROR_CODES entry has approved Arabic copy (never English wire text)', () => {
    for (const code of KNOWN_ERROR_CODES) {
      const copy = arabicCopyForCode(code)
      expect(copy).not.toBeNull()
      expect(typeof copy!.titleAr).toBe('string')
      expect(copy!.titleAr.length).toBeGreaterThan(0)
      expect(copy!.titleAr.match(/[A-Za-z]{4,}/u)).toBeFalsy()
    }
  })

  it('every wire code OBSERVED live has Arabic copy or a reviewed backlog row', () => {
    const observed = collectedWireCodes()
    if (observed.length === 0) {
      throw new Error(
        'WIRE-CODE COLLECTION DIVERGENCE: the suite observed NO wire codes — the error-copy assertion is vacuous',
      )
    }
    const backlog = backlogCodes()
    const uncovered = observed.filter((wire) => {
      const normalized = normalizeWireErrorCode(wire.code) ?? wire.code
      return arabicCopyForCode(normalized) === null && !backlog.has(normalized)
    })
    if (uncovered.length > 0) {
      throw new Error(
        `ERROR-COPY DIVERGENCE: these live wire codes have NO Arabic copy and NO backlog row ` +
          `(observe in src/shared/api/error-copy-ar.ts or docs/error-copy-ar-backlog.md): ` +
          `${JSON.stringify(uncovered).slice(0, 400)}`,
      )
    }
    expect(observed.length).toBeGreaterThan(0)
  })

  it('normalizeApiError on the REAL 400 refresh-no-cookie -> Arabic title, exact code', async () => {
    try {
      await apiClient.post('/auth/refresh', undefined, withoutCookie({}))
      throw new Error(
        'REFRESH NO-COOKIE DIVERGENCE: expected 400 but the call SUCCEEDED — see auth.contract-smoke.ts',
      )
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      if (apiError.code !== 'USERS_INVALID_REFRESH_TOKEN') {
        throw new Error(
          `REFRESH NORMALIZATION DIVERGENCE: expected USERS_INVALID_REFRESH_TOKEN — observed code=${apiError.code} titleAr=${apiError.titleAr}`,
          { cause: error },
        )
      }
      expect(apiError.titleAr.length).toBeGreaterThan(0)
      expect(latinRun(apiError.titleAr)).toBeFalsy()
    }
  })

  it('normalizeApiError on the REAL 403 origin rejection -> Arabic title, never the English message', async () => {
    try {
      await apiClient.post('/auth/refresh', undefined, {
        headers: { Origin: 'http://evil.origin' },
      })
      throw new Error(
        'REFRESH ORIGIN DIVERGENCE: expected 403 but the call SUCCEEDED — see auth.contract-smoke.ts',
      )
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      if (apiError.status !== 403) {
        throw new Error(
          `ORIGIN NORMALIZATION DIVERGENCE: expected status=403 — observed status=${String(apiError.status)} code=${apiError.code}`,
          { cause: error },
        )
      }
      expect(apiError.titleAr.length).toBeGreaterThan(0)
      expect(apiError.titleAr).not.toContain('REFRESH_TOKEN_ORIGIN_REJECTED')
    }
  })
})
