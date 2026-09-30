/**
 * Mutation safety helpers for the direct-backend transport (D-INT-02 / ADR-0001; `docs/adr/0001-*.md`; `docs/direct-backend-integration-plan.md` §6).
 *
 * Keeps idempotency-key creation + chaining, row-version injection for optimistic
 * concurrency, and the contract 409-recognizer. No persistence; no token handled
 * here (tokens remain memory-only in `session-adapter.ts`).
 */

import type { AxiosRequestConfig } from 'axios'

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
