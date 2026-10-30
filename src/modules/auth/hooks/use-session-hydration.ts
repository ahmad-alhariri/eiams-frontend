import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { environment } from '@/config/env'
import { ROUTE_METADATA } from '@/config/routes'
import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'
import {
  authSessionQueryKey,
  hasRememberedSession,
} from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { resolveRouteTrail } from '@/shared/layout/header/breadcrumb-utils'
import { isDevAuthBypassEnabled } from '@/shared/services/dev-session'

/**
 * True when the application was opened on a route `ROUTE_METADATA` marks
 * public. A public route (login, not-found, dev gallery) has no session to
 * restore, so the browser must not ask the server for one.
 */
function isPublicLocation(): boolean {
  const routeKey = resolveRouteTrail(window.location.pathname)?.at(-1)
  return routeKey !== undefined && ROUTE_METADATA[routeKey].public === true
}

/**
 * Whether this page load can hold a refresh-cookie session.
 *
 * A protected route alone is not enough: the cookie is HttpOnly, so a browser
 * that has never signed in cannot be asked whether it holds one without the
 * server answering 400, which the browser and backend both log as an error.
 * The device hint records that this browser signed in before; the refresh
 * response still decides whether the session is real. The dev auth bypass
 * serves the refresh from a fixture, so it needs no hint.
 */
function shouldRestoreSession(): boolean {
  return !isPublicLocation() && (hasRememberedSession() || isDevAuthBypassEnabled(environment))
}

/** Starts one refresh-cookie-backed session bootstrap for the application. */
export function useSessionHydration() {
  const status = useAuthSessionStore((state) => state.status)
  // Read once: the bootstrap is a start-of-application concern, so a later
  // navigation must never re-decide the outcome of a session.
  const [restoreEnabled] = useState(shouldRestoreSession)

  useEffect(() => {
    if (!restoreEnabled && status === 'initializing') {
      // Nothing to restore, so the bootstrap resolves as "not signed in"
      // without a request the browser cannot satisfy.
      useAuthSessionStore.getState().clearSession()
    }
  }, [restoreEnabled, status])

  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authSessionLifecycle.hydrate,
    // A failed bootstrap transitions the lifecycle store out of `initializing`.
    // Keeping this observer disabled afterwards is what makes cache removal
    // final rather than immediately recreating the refresh request.
    enabled: restoreEnabled && status === 'initializing',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
