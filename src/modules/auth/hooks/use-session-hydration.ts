import { useQuery } from '@tanstack/react-query'

import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

/** Starts one refresh-cookie-backed session bootstrap for the application. */
export function useSessionHydration() {
  const status = useAuthSessionStore((state) => state.status)

  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: authSessionLifecycle.hydrate,
    // A failed bootstrap transitions the lifecycle store out of `initializing`.
    // Keeping this observer disabled afterwards is what makes cache removal
    // final rather than immediately recreating the refresh request.
    enabled: status === 'initializing',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
