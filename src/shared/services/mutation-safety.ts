import type { AxiosRequestConfig } from 'axios'

import { normalizeApiError } from '@/shared/services/api-error'
import type { ParameterIdempotencyKey } from '@/shared/types/generated/eiams-v1'

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key' as const

export type IdempotencyKey = ParameterIdempotencyKey

export type IdempotentRequest = Readonly<{
  idempotencyKey: IdempotencyKey
  config: Pick<AxiosRequestConfig, 'headers'>
}>

/**
 * Creates one contract UUID for a single retry-sensitive user action.
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
    config: {
      headers: {
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
      },
    },
  }
}

/**
 * Starts a retry-safe action with one immutable idempotency key. Reuse the
 * returned request object when retrying after an uncertain transport outcome.
 */
export function createIdempotentRequest(): IdempotentRequest {
  return withIdempotencyKey(createIdempotencyKey())
}

/**
 * Copies an authoritative version into a mutable-action payload. This helper
 * never increments, derives, or persists the version; the server owns all
 * optimistic-concurrency decisions.
 */
export function withRowVersion<TPayload extends object>(
  payload: TPayload,
  rowVersion: number,
): Omit<TPayload, 'rowVersion'> & { rowVersion: number } {
  return { ...payload, rowVersion }
}

/**
 * Recognizes the contract's 409 conflict envelope without asserting why it
 * occurred. A 409 may represent a stale row version, state conflict, or an
 * idempotency conflict, so each feature decides its contract-backed recovery.
 */
export function isConflictError(error: unknown): boolean {
  return normalizeApiError(error).status === 409
}
