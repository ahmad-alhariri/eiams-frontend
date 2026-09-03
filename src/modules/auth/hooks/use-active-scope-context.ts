import { useMutation, useQuery } from '@tanstack/react-query'

import { environment } from '@/config/env'
import { activeScopeContext } from '@/modules/auth/services/active-scope-runtime'
import { authService } from '@/modules/auth/services/auth.service'
import { selectedScope } from '@/modules/auth/services/active-scope-context'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

/**
 * Reads the sole cached server session and exposes its active scope transition.
 * Scope selection UI and permission/route decisions compose this hook later.
 *
 * D-SRS-01 singular-session path: when `experimentalSingularSession` is true,
 * the contract exposes exactly one activeScope and the hook returns a no-op
 * `switchScope` so the legacy switcher consumer (when present) does not crash
 * before its own flag gate fires. Active-scope derived values
 * (`activeScope`, `activeScopeCacheKey`) remain correct under both modes
 * because they read directly from the cached session. The `useMutation` call
 * is unconditional so React's rules of hooks hold in either mode.
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
  const activeScopeCacheKey =
    activeScope === undefined ? undefined : activeScopeContext.getActiveScopeCacheKey()
  const singularSession = environment.experimentalSingularSession

  return {
    ...sessionQuery,
    activeScope,
    activeScopeCacheKey,
    switchScope: singularSession ? () => Promise.resolve() : switchMutation.mutateAsync,
    isSwitchingScope: singularSession ? false : switchMutation.isPending,
    switchError: singularSession ? null : switchMutation.error,
  }
}
