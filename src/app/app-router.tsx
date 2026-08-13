import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppLayout } from '@/shared/layout/app-layout'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import {
  AnonymousRoute,
  NoAccessRoute,
  RequireSelectedScope,
  RouteAccessGuard,
  ScopeSelectionRoute,
} from '@/modules/auth/components/route-guards'
import { ActiveScopeSwitcher } from '@/modules/auth/components/active-scope-switcher'
import { ROUTE_PATHS } from '@/config/routes'
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
 * App routes render inside the AppLayout frame; anonymous routes own their
 * standalone composition and mount outside that frame. Lazy routes retain the
 * shared per-domain error boundary, while AppLayout supplies its own suspense
 * boundary for framed pages.
 */
const PROTECTED_ROUTE_OBJECTS = getWiredRouteKeys().flatMap((key) => {
  if (key === 'login' || key === 'notFound' || key === 'devGallery') {
    return []
  }
  if (isDevOnlyRoute(key) && !import.meta.env.DEV) {
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
      <AnonymousRoute>
        <RouteSuspense>{LOGIN_ROUTE.element}</RouteSuspense>
      </AnonymousRoute>
    ),
  },
  {
    path: ROUTE_PATHS.scopeSelect,
    element: <ScopeSelectionRoute />,
  },
  {
    path: ROUTE_PATHS.noAccess,
    element: <NoAccessRoute />,
  },
  {
    element: <AppLayout />,
    children: DEV_GALLERY_ROUTE,
  },
  {
    element: (
      <RequireSelectedScope>
        <AppLayout scopeSwitcher={<ActiveScopeSwitcher />} />
      </RequireSelectedScope>
    ),
    children: PROTECTED_ROUTE_OBJECTS,
  },
  {
    element: <AppLayout />,
    children: NOT_FOUND_ROUTE,
  },
])

export function AppRouter() {
  return <RouterProvider router={appRouter} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { appRouter }
