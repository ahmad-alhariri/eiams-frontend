/**
 * Shared types for the EIAMS frontend.
 *
 * These are hand-written types that complement the generated API types.
 * They are used across modules for scope/caching concerns that are not
 * part of the API contract.
 */

import type { ScopeCacheKey } from '@/shared/services/query-keys'

/**
 * The active authorization scope as selected by the server session.
 *
 * This is the canonical scope representation used across all query keys
 * and mutation invalidation. It follows the same shape as ScopeCacheKey
 * from the query-keys factory.
 */
export type ActiveScope = ScopeCacheKey
