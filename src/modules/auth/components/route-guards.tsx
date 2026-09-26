import { useQueryClient } from '@tanstack/react-query'
import { IconLockAccess, IconShieldLock } from '@tabler/icons-react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'

import { ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { useRoutePermission } from '@/modules/auth/hooks/use-permission'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { FullPageSpinner } from '@/shared/feedback/full-page-spinner'
import { Button } from '@/shared/ui/button'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

type RouteGuardProps = {
  children: ReactNode
}

type RouteAccessGuardProps = RouteGuardProps & {
  route: RouteKey
}

/**
 * Reads the cached session projection and re-renders this component whenever
 * the cache entry changes (e.g. after `setQueryData` from `installLogin` or
 * `hydrate`). `useQuery({enabled: false})` does NOT subscribe to cache
 * mutations because the observer is disabled, and `getQueryData` alone does
 * not trigger re-renders. The TanStack-canonical pattern is to subscribe to
 * the QueryCache via `subscribe`; we wrap that in `useSyncExternalStore` so
 * React treats the cache entry as the source of truth for re-rendering.
 */
function useCachedSession(): SessionResponse | undefined {
  const queryClient = useQueryClient()
  const subscribe = (onChange: () => void) =>
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'added' || event.type === 'removed') {
        const updatedKey = (event as { query: { queryKey: readonly unknown[] } }).query.queryKey
        if (updatedKey[0] === authSessionQueryKey[0] && updatedKey[1] === authSessionQueryKey[1]) {
          onChange()
        }
      }
    })
  return useSyncExternalStore(subscribe, () => queryClient.getQueryData<SessionResponse>(authSessionQueryKey))
}

function AuthLoadingBoundary() {
  return (
    <main dir="rtl" aria-label="التحقق من الجلسة" className="min-h-dvh bg-background">
      <FullPageSpinner label="جارٍ التحقق من الجلسة..." />
    </main>
  )
}

function NoAccessScreen({ unavailable }: { unavailable: boolean }) {
  const title = unavailable ? 'لا يتوفر نطاق عمل' : 'لا توجد صلاحية للوصول'
  const description = unavailable
    ? 'لا توجد صلاحيات نطاق فعّالة مرتبطة بحسابك حالياً. تواصل مع مسؤول النظام للمساعدة.'
    : 'حسابك لا يملك النطاق أو الصلاحية اللازمة للوصول إلى النظام.'

  return (
    <main
      dir="rtl"
      aria-labelledby="no-access-title"
      className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-8"
    >
      <section className="w-full max-w-lg rounded-2xl border border-border bg-popover p-8 text-center shadow-modal sm:p-10">
        <span
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-primary"
          aria-hidden
        >
          <IconLockAccess className="size-7" />
        </span>
        <h1 id="no-access-title" className="mt-5 text-2xl font-bold text-foreground">
          {title}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
      </section>
    </main>
  )
}

/**
 * D-SRS-01 singular-session guard.
 *
 * The backend exposes exactly one persistent `UserRoleScope` per user and one
 * required activeScope on the session. There is no `availableScopes`
 * collection, no `SelectionRequired` state, and no client scope switch.
 * An authenticated session is therefore either:
 *
 *   - present with a scope → render the protected route;
 *   - present with no scope (server-detected Unavailable) → render the
 *     no-access screen;
 *   - absent → either continue loading or redirect to /login.
 */
function hasActiveScope(session: SessionResponse | undefined): boolean {
  return session !== undefined && session.activeScope !== undefined
}

function RequireSelectedScope({ children }: RouteGuardProps) {
  const status = useAuthSessionStore((state) => state.status)
  const session = useCachedSession()

  if (status === 'initializing') {
    return <AuthLoadingBoundary />
  }

  if (status === 'unauthenticated') {
    return <Navigate to={ROUTE_PATHS.login} replace />
  }

  if (!session) {
    return <AuthLoadingBoundary />
  }

  if (!hasActiveScope(session)) {
    return <NoAccessScreen unavailable />
  }

  return <>{children}</>
}

/**
 * Keeps public login content out of the app shell while hydration is pending
 * and sends already-authenticated users to the dashboard or the no-access
 * screen based on the singular session shape.
 */
function AnonymousRoute({ children }: RouteGuardProps) {
  const status = useAuthSessionStore((state) => state.status)
  const session = useCachedSession()

  if (status === 'initializing') {
    return <AuthLoadingBoundary />
  }

  if (status === 'unauthenticated') {
    return <>{children}</>
  }

  if (!session) {
    return <AuthLoadingBoundary />
  }

  if (!hasActiveScope(session)) {
    return <Navigate to={ROUTE_PATHS.noAccess} replace />
  }

  return <Navigate to={ROUTE_PATHS.dashboard} replace />
}

/** Renders the no-access screen for an authenticated user without scope access. */
function NoAccessRoute() {
  const status = useAuthSessionStore((state) => state.status)
  const session = useCachedSession()

  if (status === 'initializing') {
    return <AuthLoadingBoundary />
  }

  if (status === 'unauthenticated') {
    return <Navigate to={ROUTE_PATHS.login} replace />
  }

  if (!session || !hasActiveScope(session)) {
    return <NoAccessScreen unavailable />
  }

  return <Navigate to={ROUTE_PATHS.dashboard} replace />
}

function PermissionDenied() {
  return (
    <main
      dir="rtl"
      aria-labelledby="permission-denied-title"
      className="flex min-h-[24rem] items-center justify-center"
    >
      <section className="w-full max-w-lg rounded-2xl border border-border bg-popover p-8 text-center shadow-card">
        <IconShieldLock className="mx-auto size-10 text-destructive" aria-hidden />
        <h1 id="permission-denied-title" className="mt-4 text-xl font-bold text-foreground">
          ليست لديك صلاحية الوصول
        </h1>
        <p className="mt-2 leading-7 text-muted-foreground">
          لا تملك الصلاحية المطلوبة للوصول إلى هذه الصفحة ضمن نطاق العمل الحالي.
        </p>
        <Button nativeButton={false} className="mt-6" render={<Link to={ROUTE_PATHS.dashboard} />}>
          العودة إلى لوحة المعلومات
        </Button>
      </section>
    </main>
  )
}

/**
 * Composes the selected-scope boundary with the canonical e06-t06 permission
 * predicate. It deliberately contains no role or permission-string logic.
 */
function RouteAccessGuard({ children, route }: RouteAccessGuardProps) {
  const hasRoutePermission = useRoutePermission(route)

  return (
    <RequireSelectedScope>
      {hasRoutePermission ? children : <PermissionDenied />}
    </RequireSelectedScope>
  )
}

export {
  AnonymousRoute,
  AuthLoadingBoundary,
  NoAccessRoute,
  RequireSelectedScope,
  RouteAccessGuard,
}
