import { useMutation, useQuery } from '@tanstack/react-query'

import { activeScopeContext } from '@/modules/auth/services/active-scope-runtime'
import { authService } from '@/modules/auth/services/auth.service'
import { selectedScope } from '@/modules/auth/services/active-scope-context'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

/**
 * Reads the sole cached server session and exposes its active scope transition.
 * Scope selection UI and permission/route decisions compose this hook later.
 */
export function useActiveScopeContext() {
  const authStatus = useAuthSessionStore((state) => state.status)
  const sessionQuery = useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authService.getSession,
    enabled: authStatus === 'authenticated',
    staleTime: Number.POSITIVE_INFINITY,
  })
  const switchMutation = useMutation({ mutationFn: activeScopeContext.switchScope })
  const activeScope = selectedScope(sessionQuery.data)

  return {
    ...sessionQuery,
    activeScope,
    activeScopeCacheKey:
      activeScope === undefined ? undefined : activeScopeContext.getActiveScopeCacheKey(),
    switchScope: switchMutation.mutateAsync,
    isSwitchingScope: switchMutation.isPending,
    switchError: switchMutation.error,
  }
}
