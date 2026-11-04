import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { SCOPED_PREFIX, UNSCOPED_PREFIX } from '@/shared/services/query-keys'
import type { AuthService } from '@/modules/auth/services/auth.service'
import type { AuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { SessionAdapter } from '@/shared/services/session-adapter'
import type { AuthTokenResponse, SessionResponse } from '@/modules/auth/types/session.types'

/** The sole cached server projection of the signed-in EIAMS session. */
export const authSessionQueryKey = ['auth', 'session'] as const

/**
 * The device-level "this browser has signed in" hint.
 *
 * The refresh cookie is HttpOnly (`Web.Api/Infrastructure/AuthCookies.cs`), so
 * no browser API can say whether one exists. Without a hint the only way to
 * find out is to call `/auth/refresh`, and for a first-time visitor that
 * answers 400 USERS_INVALID_REFRESH_TOKEN — which the browser logs as a console
 * error and the backend logs as a CORS policy failure. The hint never proves a
 * session: a restore still needs a successful refresh. It is also required, so
 * a browser whose local storage was cleared while its cookie survives has to
 * sign in again. It is written on login and on a successful restore, and
 * dropped whenever the local session is cleared.
 */
const SESSION_HINT_STORAGE_KEY = 'eiams.auth.has-session'

export function hasRememberedSession(): boolean {
  try {
    return window.localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberSession(): void {
  try {
    window.localStorage.setItem(SESSION_HINT_STORAGE_KEY, '1')
  } catch {
    // Storage can be unavailable (private mode). The hint is only an
    // optimisation: without it the next load asks the server once.
  }
}

function forgetSession(): void {
  try {
    window.localStorage.removeItem(SESSION_HINT_STORAGE_KEY)
  } catch {
    // See rememberSession: there is nothing to recover when storage is off.
  }
}

function isProtectedQuery(queryKey: QueryKey): boolean {
  const namespace = queryKey[0]
  return namespace === 'auth' || namespace === SCOPED_PREFIX || namespace === UNSCOPED_PREFIX
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
  /** Resolves with the restored session, or `null` when this browser has none. */
  hydrate: () => Promise<SessionResponse | null>
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
        // Any clear means the browser no longer has a session to restore, so a
        // later load must not ask `/auth/refresh` for one.
        forgetSession()
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
        rememberSession()
        queryClient.setQueryData(authSessionQueryKey, session)
        sessionStore.getState().markAuthenticated()
        return session
      } catch {
        // A failed refresh is "no session", not an error. Nothing reads the
        // rejection, and an errored bootstrap query is exactly what the
        // browser logs and refetches on remount; the lifecycle store's status
        // is the outcome. The hint is dropped by `clearLocalSession`.
        await clearLocalSession()
        return null
      }
    },
    installLogin(response) {
      rememberSession()
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
