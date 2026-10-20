/**
 * Mutation safety helpers for the direct-backend transport (D-INT-02 / ADR-0001; `docs/adr/0001-*.md`; `docs/direct-backend-integration-plan.md` §6).
 *
 * Keeps idempotency-key creation + chaining, row-version injection for optimistic
 * concurrency, and the contract 409-recognizer. No persistence; no token handled
 * here (tokens remain memory-only in `session-adapter.ts`).
 */

import type { AxiosRequestConfig } from 'axios'

import { normalizeWireErrorCode, readApiError } from '@/shared/api/envelope'

/** Header name used by the contract idempotency-key mechanism. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key' as const

/** A contract UUID used as the idempotency key for one retry-sensitive user action. */
export type IdempotencyKey = string

/** The shape returned by `withIdempotencyKey`: a key plus an isolated headers pick
 * so callers never accidentally share or mutate a shared Axios config. */
export type IdempotentRequest = Readonly<{
  readonly idempotencyKey: IdempotencyKey
  readonly config: Pick<AxiosRequestConfig, 'headers'>
}>

/** Creates one contract UUID for a single retry-sensitive user action.
 *
 * Callers keep the returned value for every user-approved retry of that action
 * and create a new one only after the user starts a distinct action. The API,
 * rather than the browser, owns duplicate detection and replayed results.
 */
export function createIdempotencyKey(): IdempotencyKey {
  return crypto.randomUUID()
}

/** Adds the contract header without mutating a caller-owned Axios config. */
export function withIdempotencyKey(idempotencyKey: IdempotencyKey): IdempotentRequest {
  return {
    idempotencyKey,
    config: { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
  }
}

/** Starts a retry-safe action with one immutable idempotency key. Reuse the
 * returned request object when retrying after an uncertain transport outcome.
 */
export function createIdempotentRequest(): IdempotentRequest {
  return withIdempotencyKey(createIdempotencyKey())
}

/** Copies an authoritative version into a mutable-action payload. This helper
 * never increments, derives, or persists the version; the server owns all
 * optimistic-concurrency decisions.
 */
export function withRowVersion<TPayload extends object>(
  payload: TPayload,
  rowVersion: number,
): Omit<TPayload, 'rowVersion'> & { rowVersion: number } {
  return { ...payload, rowVersion }
}

/** Recognizes the contract's 409 conflict envelope without asserting why it
 * occurred. A 409 may represent a stale row version, state conflict, or an
 * idempotency conflict, so each feature decides its contract-backed recovery.
 */
export function isConflictError(error: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error as any)?.response?.status === 409
}

/**
 * Every optimistic-concurrency code the API emits ends with this suffix, whatever
 * aggregate it belongs to: `WarehouseDocuments.RowVersionMismatch` and
 * `Custodies.RowVersionMismatch` normalize to `*_ROW_VERSION_MISMATCH`, and
 * `Materials.CatalogVersionMismatch` normalizes to
 * `MATERIALS_CATALOG_VERSION_MISMATCH`. Every other 409 is a state or
 * idempotency conflict (`CUSTODIES_CANNOT_REVERSE_CHANGED_CUSTODY`,
 * `REQUEST_IDEMPOTENCY_MISMATCH`, …) and says nothing about who wrote the row.
 */
const CONCURRENCY_CODE_SUFFIX = 'VERSION_MISMATCH'

/** `readApiError` substitutes this when the envelope carries no usable code. */
const UNKNOWN_ERROR_CODE = 'UNKNOWN'

/** The normalized wire code of a failed request, or null when it carries none. */
function conflictErrorCode(error: unknown): string | null {
  const response = (error as { readonly response?: { readonly data?: unknown } } | null | undefined)
    ?.response
  if (response === undefined) {
    return null
  }
  const code = normalizeWireErrorCode(readApiError(response.data)?.code)
  return code === null || code === UNKNOWN_ERROR_CODE ? null : code
}

/**
 * True when a 409 reports a CONCURRENT EDIT: another actor wrote to the same
 * row, so the request this client held is stale and the feature's documented
 * recovery is to refetch the authoritative state.
 *
 * A 409 whose code is missing cannot be told apart from a state conflict, so it
 * keeps the recoverable reading: refetching is harmless when the real cause was
 * something else, whereas claiming another user edited the document when they
 * did not is not.
 */
export function isConcurrencyConflict(error: unknown): boolean {
  if (!isConflictError(error)) {
    return false
  }
  const code = conflictErrorCode(error)
  return code === null || code.endsWith(CONCURRENCY_CODE_SUFFIX)
}
