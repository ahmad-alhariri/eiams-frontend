import type { QueryClient } from '@tanstack/react-query'

import type { AuthService } from '@/modules/auth/services/auth.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { normalizeApiError } from '@/shared/services/api-error'
import { clearScopedQueries, type ScopeCacheKey } from '@/shared/services/query-keys'
import type {
  ScopeContext,
  SessionResponse,
  SetActiveScopeRequest,
} from '@/shared/types/generated/eiams-v1'

export interface ActiveScopeContextDependencies {
  authService: Pick<AuthService, 'getSession' | 'setActiveScope'>
  queryClient: QueryClient
}

export interface ActiveScopeContext {
  getSession: () => SessionResponse | undefined
  getActiveScope: () => ScopeContext | undefined
  getActiveScopeCacheKey: () => ScopeCacheKey | undefined
  switchScope: (request: SetActiveScopeRequest) => Promise<SessionResponse>
}

/** Converts the server-owned scope projection into the shared scoped-cache namespace. */
export function toScopeCacheKey(scope: ScopeContext): ScopeCacheKey {
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

/** Returns an active scope only when the contract has selected one. */
export function selectedScope(session: SessionResponse | undefined): ScopeContext | undefined {
  return session?.scopeState === 'Selected' ? session.activeScope : undefined
}

/**
 * Owns the ordered server mutation and query-cache transition for a scope.
 *
 * Scope data is intentionally not copied into Zustand or a second local
 * context. The authoritative session remains the single TanStack Query entry.
 */
export function createActiveScopeContext({
  authService,
  queryClient,
}: ActiveScopeContextDependencies): ActiveScopeContext {
  let switchQueue: Promise<void> = Promise.resolve()

  const refetchSessionAfterScopeRevocation = async () => {
    try {
      await queryClient.fetchQuery({
        queryKey: authSessionQueryKey,
        queryFn: authService.getSession,
        staleTime: 0,
      })
    } catch {
      // The rejected scope switch remains the caller-visible failure. The
      // normal auth transport/lifecycle boundaries own a failed refetch.
    }
  }

  const performSwitch = async (request: SetActiveScopeRequest): Promise<SessionResponse> => {
    try {
      const session = await authService.setActiveScope(request)
      await clearScopedQueries(queryClient)
      queryClient.setQueryData(authSessionQueryKey, session)
      return session
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      if (apiError.status === 403 && apiError.code === 'auth.scope_not_available') {
        await refetchSessionAfterScopeRevocation()
      }
      throw error
    }
  }

  return {
    getSession: () => queryClient.getQueryData<SessionResponse>(authSessionQueryKey),
    getActiveScope: () =>
      selectedScope(queryClient.getQueryData<SessionResponse>(authSessionQueryKey)),
    getActiveScopeCacheKey: () => {
      const scope = selectedScope(queryClient.getQueryData<SessionResponse>(authSessionQueryKey))
      return scope === undefined ? undefined : toScopeCacheKey(scope)
    },
    switchScope(request) {
      const operation = switchQueue.then(() => performSwitch(request))
      switchQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      return operation
    },
  }
}
