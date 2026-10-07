import type { QueryClient } from '@tanstack/react-query'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { SessionResponse, SessionScope } from '@/modules/auth/types/session.types'

export interface ActiveScopeContext {
  getSession: () => SessionResponse | undefined
  getActiveScope: () => SessionScope | undefined
  getActiveScopeCacheKey: () => ScopeCacheKey | undefined
}

/** Converts the server-owned scope projection into the shared scoped-cache namespace. */
export function toScopeCacheKey(scope: SessionScope): ScopeCacheKey {
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

/**
 * Returns the server-assigned active scope.
 *
 * The session itself may be absent (not yet hydrated), which is why this accepts
 * `undefined`. A session that *does* exist always carries a scope, so there is no
 * "loaded but scope unknown" state to represent here.
 */
export function selectedScope(session: SessionResponse | undefined): SessionScope | undefined {
  return session?.activeScope
}

/**
 * Read-only projection of the server-owned active scope.
 *
 * The backend assigns the scope and owns every scope decision server-side, so
 * this context deliberately exposes no mutation. Scope data is intentionally not
 * copied into Zustand or a second local context: the authoritative session
 * remains the single TanStack Query entry.
 */
export function createActiveScopeContext(queryClient: QueryClient): ActiveScopeContext {
  const getSession = () => queryClient.getQueryData<SessionResponse>(authSessionQueryKey)

  return {
    getSession,
    getActiveScope: () => selectedScope(getSession()),
    getActiveScopeCacheKey: () => {
      const scope = selectedScope(getSession())
      return scope === undefined ? undefined : toScopeCacheKey(scope)
    },
  }
}
