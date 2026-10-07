import { useQuery, useQueryClient } from '@tanstack/react-query'

import { createActiveScopeContext } from '@/modules/auth/services/active-scope-context'
import { authService } from '@/modules/auth/services/auth.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

/**
 * Reads the sole cached server session and exposes its server-assigned active
 * scope. The scope is read-only: the backend owns scope assignment, so this hook
 * intentionally exposes no mutation.
 */
export function useActiveScopeContext() {
  const authStatus = useAuthSessionStore((state) => state.status)
  const queryClient = useQueryClient()
  const sessionQuery = useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authService.getSession,
    enabled: authStatus === 'authenticated',
    staleTime: Number.POSITIVE_INFINITY,
  })
  const scopeContext = createActiveScopeContext(queryClient)

  return {
    ...sessionQuery,
    activeScope: scopeContext.getActiveScope(),
    activeScopeCacheKey: scopeContext.getActiveScopeCacheKey(),
  }
}
