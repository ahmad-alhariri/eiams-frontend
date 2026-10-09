import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppLayout } from '@/shared/layout/app-layout'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import { UiSandboxMarker } from '@/shared/layout/ui-sandbox-marker'
import {
  AnonymousRoute,
  RequireActiveScope,
  RouteAccessGuard,
} from '@/modules/auth/components/route-guards'
import { SessionUserMenu } from '@/modules/auth/components/session-user-menu'
import { AuthSessionExpiredBridge } from '@/modules/auth/components/auth-session-expired-bridge'
import { ROUTE_METADATA } from '@/config/routes'
import {
  getWiredRouteKeys,
  isDevOnlyRoute,
  toCatchAllRouteObject,
  toRouteObject,
} from '@/config/route-registry'

/**
 * Root app router (e05-t02, framed by e05-t03). Created once at module scope —
 * never inside a component. Only wired pages resolve; unwired declared routes
 * behave as unlisted URLs and fall through to the not-found catch-all
 * (D-RBAC-01).
 *
 * Protected routes are driven entirely by ROUTE_METADATA: every non-public
 * wired route gets the RouteAccessGuard (scope + permission). Public routes
 * (login, not-found, dev gallery) are composed explicitly below instead.
 *
 * App routes render inside the AppLayout frame; anonymous routes own their
 * standalone composition and mount outside that frame. Only the protected
 * branch receives the session chrome (`userMenu`): the dev-gallery and
 * not-found branches render the same frame without a session identity. Lazy
 * routes retain the shared per-domain error boundary, while AppLayout supplies
 * its own suspense boundary for framed pages.
 *
 * The RESOLUTION-040 sandbox marker has to reach the anonymous routes too, and
 * they get no AppLayout — a developer running the sandbox lands on `/login`
 * first, and an unmarked page there reads as integration evidence. Login is
 * therefore wrapped in the same `UiSandboxMarker` the frame uses, so there is
 * one element and one profile read, not two of each.
 *
 * `AuthSessionExpiredBridge` is mounted inside EVERY top-level branch rather
 * than above `RouterProvider`, for two reasons. It calls `useNavigate`, so it
 * must sit inside the router context — and `AppRouter` sits outside it. And it
 * must be mounted even on branches that no session guard wraps (the dev gallery
 * and the not-found frame): the bridge is the navigation half of D-AUTH-01
 * §"Token and session lifecycle", and a user sitting on an unguarded URL when a
 * refresh fails has no `RequireActiveScope` to return them anywhere. Exactly one
 * branch renders at a time, so all four mounts still yield one live listener.
 */
const PROTECTED_ROUTE_OBJECTS = getWiredRouteKeys().flatMap((key) => {
  if (ROUTE_METADATA[key].public) {
    return []
  }
  const route = toRouteObject(key)
  return [
    {
      ...route,
      element: <RouteAccessGuard route={key}>{route.element}</RouteAccessGuard>,
    },
  ]
})

const NOT_FOUND_ROUTE = getWiredRouteKeys().includes('notFound')
  ? [toCatchAllRouteObject('notFound')]
  : []

const LOGIN_ROUTE = toRouteObject('login')
const DEV_GALLERY_ROUTE =
  isDevOnlyRoute('devGallery') && import.meta.env.DEV ? [toRouteObject('devGallery')] : []

const appRouter = createBrowserRouter([
  {
    ...LOGIN_ROUTE,
    element: (
      <>
        <AuthSessionExpiredBridge />
        <UiSandboxMarker>
          <AnonymousRoute>
            <RouteSuspense>{LOGIN_ROUTE.element}</RouteSuspense>
          </AnonymousRoute>
        </UiSandboxMarker>
      </>
    ),
  },
  {
    element: (
      <>
        <AuthSessionExpiredBridge />
        <AppLayout />
      </>
    ),
    children: DEV_GALLERY_ROUTE,
  },
  {
    element: (
      <>
        <AuthSessionExpiredBridge />
        <RequireActiveScope>
          <AppLayout userMenu={<SessionUserMenu />} />
        </RequireActiveScope>
      </>
    ),
    children: PROTECTED_ROUTE_OBJECTS,
  },
  {
    element: (
      <>
        <AuthSessionExpiredBridge />
        <AppLayout />
      </>
    ),
    children: NOT_FOUND_ROUTE,
  },
])

export function AppRouter() {
  return <RouterProvider router={appRouter} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { appRouter }
