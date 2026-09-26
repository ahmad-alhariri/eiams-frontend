import { useQuery } from '@tanstack/react-query'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { authService } from '@/modules/auth/services/auth.service'
import { selectedScope, toScopeCacheKey } from '@/modules/auth/services/scope-query'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { ScopeCacheKey } from '@/shared/services/query-keys'

export interface ActiveScopeContext {
  activeScope: ReturnType<typeof selectedScope>
  activeScopeCacheKey: ScopeCacheKey | undefined
}

/**
 * Reads the sole server-selected active scope from the cached session.
 *
 * The backend exposes exactly one persistent `UserRoleScope` per user
 * (D-SRS-01, D-RBAC-02). The session has a single required activeScope —
 * there is no `availableScopes` collection, no `SelectionRequired` state,
 * and no client-driven scope switch. This hook is therefore purely
 * read-only: it consumes the authoritative server session and exposes its
 * active scope plus the shared scope-cache key for downstream queries.
 */
export function useActiveScopeContext(): ActiveScopeContext {
  const authStatus = useAuthSessionStore((state) => state.status)
  const sessionQuery = useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authService.getSession,
    enabled: authStatus === 'authenticated',
    staleTime: Number.POSITIVE_INFINITY,
  })

  const activeScope = selectedScope(sessionQuery.data)
  const activeScopeCacheKey = activeScope === undefined ? undefined : toScopeCacheKey(activeScope)

  return { activeScope, activeScopeCacheKey }
}
