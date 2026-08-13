import type { QueryClient, QueryKey } from '@tanstack/react-query'

import type { AuthService } from '@/modules/auth/services/auth.service'
import type { AuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { SessionAdapter } from '@/shared/services/session-adapter'
import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'

/** The sole cached server projection of the signed-in EIAMS session. */
export const authSessionQueryKey = ['auth', 'session'] as const

function isProtectedQuery(queryKey: QueryKey): boolean {
  const namespace = queryKey[0]
  return namespace === 'auth' || namespace === 'scoped'
}

/**
 * Clears session-derived and scope-bound data while intentionally retaining
 * explicitly public reference data. This prevents a revoked session from
 * briefly showing data fetched under its prior authorization context.
 */
export async function clearProtectedAuthCache(queryClient: QueryClient): Promise<void> {
  const queryFilter = {
    predicate: (query: { queryKey: QueryKey }) => isProtectedQuery(query.queryKey),
  }

  try {
    await queryClient.cancelQueries(queryFilter)
  } finally {
    queryClient.removeQueries(queryFilter)
  }
}

export interface AuthSessionLifecycleDependencies {
  authService: Pick<AuthService, 'logout'>
  queryClient: QueryClient
  sessionAdapter: SessionAdapter
  sessionStore: AuthSessionStore
}

export interface AuthSessionLifecycle {
  hydrate: () => Promise<SessionResponse>
  installLogin: (response: AuthTokenResponse) => void
  logout: () => Promise<void>
}

/**
 * Coordinates the boundaries that own a session lifecycle without copying the
 * server session projection into Zustand. Refresh remains adapter-owned;
 * the returned projection lives only in the TanStack Query cache.
 */
export function createAuthSessionLifecycle({
  authService,
  queryClient,
  sessionAdapter,
  sessionStore,
}: AuthSessionLifecycleDependencies): AuthSessionLifecycle {
  let localClearInFlight: Promise<void> | null = null

  const clearLocalSession = () => {
    if (localClearInFlight !== null) {
      return localClearInFlight
    }

    const clear = (async () => {
      try {
        await clearProtectedAuthCache(queryClient)
      } finally {
        sessionStore.getState().clearSession()
      }
    })()

    localClearInFlight = clear.finally(() => {
      localClearInFlight = null
    })

    return localClearInFlight
  }

  sessionAdapter.subscribe((event) => {
    if (event.type === 'session-expired') {
      // A refresh can fail while an unrelated protected query is in flight.
      // The adapter owns the credential, so this bridge owns the matching
      // query-cache eviction required by D-AUTH-01. The adapter's synchronous
      // notification cannot await cleanup; the shared promise still coalesces
      // it with hydrate/logout cleanup without leaking a rejection.
      void clearLocalSession()
    }
  })

  return {
    async hydrate() {
      try {
        const session = await sessionAdapter.refreshSession()
        queryClient.setQueryData(authSessionQueryKey, session)
        sessionStore.getState().markAuthenticated()
        return session
      } catch (error: unknown) {
        await clearLocalSession()
        throw error
      }
    },
    installLogin(response) {
      sessionStore.getState().installLogin(response)
      queryClient.setQueryData(authSessionQueryKey, response.session)
    },
    async logout() {
      try {
        await authService.logout()
      } finally {
        // Logout is intentionally locally final even when a network response
        // is lost, matching the idempotent D-AUTH-01 contract.
        await clearLocalSession()
      }
    },
  }
}
