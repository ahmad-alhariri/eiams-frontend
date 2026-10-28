/**
 * The wire codes the contract suite OBSERVED, collected across every test
 * file (shared module registry — see `vitest.contract.config.ts`).
 *
 * The error-copy assertion (coverage item 8) is table-driven over THESE codes
 * plus the table's own `KNOWN_ERROR_CODES`: a code observed on the live wire
 * must either have approved Arabic copy in `shared/api/error-copy-ar.ts` or be
 * listed in `docs/error-copy-ar-backlog.md` (the reviewed fallback backlog).
 * A code that is neither is a genuine frontend divergence and the test fails.
 */
import { readApiError } from '@/shared/api/envelope'

export interface ObservedWireCode {
  readonly code: string
  readonly status: number
  /** The request that produced it, e.g. `POST /auth/refresh`. */
  readonly source: string
}

const observed = new Map<string, ObservedWireCode>()

export function recordWireCode(code: string, status: number, source: string): void {
  const trimmed = code.trim()
  if (trimmed.length === 0 || observed.has(trimmed)) {
    return
  }
  observed.set(trimmed, { code: trimmed, status, source })
}

/** Records a raw (non-axios) probe response body if it carries the error envelope. */
export function recordWireErrorPayload(status: number, payload: unknown, source: string): void {
  const wire = readApiError(payload)
  if (wire !== null) {
    recordWireCode(wire.code, status, source)
  }
}

/** Sorted so a failure lists the collected codes readably. Empty means nothing was observed. */
export function collectedWireCodes(): readonly ObservedWireCode[] {
  return Array.from(observed.values()).sort((a, b) => a.code.localeCompare(b.code))
}
