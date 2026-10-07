import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { sessionAdapter } from '@/shared/services/api.client'

/**
 * Navigates to the Arabic login route when the session adapter reports a
 * terminal `session-expired` event (refresh failure, replayed refresh
 * token, server-detected inactive assignment).
 *
 * D-AUTH-01 §"Token and session lifecycle":
 *   "A failed refresh clears the in-memory access token and authenticated
 *    caches, then returns the user to the Arabic login route."
 *
 * The cache-clearing half of that contract is owned by
 * `authSessionLifecycle.clearLocalSession`, which subscribes to the same
 * adapter. This bridge adds the navigation half: the adapter singleton is
 * a transport-layer module (constructed before React mounts) and must not
 * depend on React Router, so we run a thin React-scoped bridge at the
 * application root that subscribes once and dispatches the navigation.
 *
 * The bridge subscribes on mount and tears down on unmount; React's
 * StrictMode double-invokes the effect in development, but the returned
 * unsubscribe function runs at the end of each cycle, so the listener count
 * stays at exactly one per live bridge instance.
 */
export function AuthSessionExpiredBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = sessionAdapter.subscribe((event) => {
      if (event.type !== 'session-expired') {
        return
      }
      navigate(ROUTE_PATHS.login, { replace: true })
    })
    return unsubscribe
  }, [navigate])

  return null
}
