import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { ROUTE_PATHS } from '@/config/routes'
import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

/**
 * True when the application was opened on the PUBLIC login route.
 *
 * The route is the only signal the browser has: the refresh cookie is
 * HttpOnly (`Web.Api/Infrastructure/AuthCookies.cs`), so `document.cookie`
 * cannot say whether the browser still holds one, and asking the server is
 * the very request this hook must not make.
 */
function isPublicLoginLocation(): boolean {
  return window.location.pathname.replace(/\/+$/u, '') === ROUTE_PATHS.login
}

/** Starts one refresh-cookie-backed session bootstrap for the application. */
export function useSessionHydration() {
  const status = useAuthSessionStore((state) => state.status)
  // Read once: the bootstrap is a start-of-application concern, so a later
  // navigation must never re-decide the outcome of a session.
  const [openedOnPublicRoute] = useState(isPublicLoginLocation)

  useEffect(() => {
    if (!openedOnPublicRoute || status !== 'initializing') {
      return
    }
    // The public login route has no session to restore, so the bootstrap
    // resolves as "not signed in" instead of asking the server for a refresh
    // the browser cannot satisfy: that request answers 400
    // USERS_INVALID_REFRESH_TOKEN and the browser logs it as an error.
    useAuthSessionStore.getState().clearSession()
  }, [openedOnPublicRoute, status])

  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authSessionLifecycle.hydrate,
    // A failed bootstrap transitions the lifecycle store out of `initializing`.
    // Keeping this observer disabled afterwards is what makes cache removal
    // final rather than immediately recreating the refresh request.
    enabled: status === 'initializing' && !openedOnPublicRoute,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
