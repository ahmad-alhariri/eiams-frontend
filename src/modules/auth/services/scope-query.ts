import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { SessionResponse } from '@/modules/auth/types/auth.api-types'

/**
 * Returns the sole server-selected active scope from the cached session, or
 * undefined if the session is missing. The backend exposes exactly one
 * persistent `UserRoleScope` per user (D-SRS-01); the session response
 * carries one `activeScope` rather than an `availableScopes` collection.
 */
export function selectedScope(session: SessionResponse | undefined) {
  return session?.activeScope
}

/**
 * Converts the server-owned scope projection into the shared scoped-cache
 * namespace consumed by every TanStack Query that depends on the active
 * scope (`queryKeys.scoped(scopeCacheKey, resource, ...)`).
 *
 * Enterprise scope carries no UUID; Site and Warehouse scopes carry the
 * entity UUID. The backend always returns a non-null `scopeId` for Site
 * and Warehouse; if that invariant is ever violated the server call is
 * treated as malformed and the hook falls back to `undefined`.
 */
export function toScopeCacheKey(scope: NonNullable<SessionResponse['activeScope']>): ScopeCacheKey {
  if (scope.scopeType === 'Enterprise') {
    return { kind: 'enterprise' }
  }

  if (scope.scopeId === null) {
    throw new TypeError('A Site or Warehouse scope must include its identifier.')
  }

  return scope.scopeType === 'Site'
    ? { kind: 'site', id: scope.scopeId }
    : { kind: 'warehouse', id: scope.scopeId }
}
