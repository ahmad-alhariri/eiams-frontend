import { useQuery } from '@tanstack/react-query'
import { IconLockAccess, IconRoute, IconShieldLock } from '@tabler/icons-react'
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
 * Observes the single query-backed session projection without triggering a
 * second hydration request. The application root owns hydration; guards only
 * decide what may render once its lifecycle outcome is known.
 */
function useCachedSession(): SessionResponse | undefined {
  const { data } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  return data
}

function AuthLoadingBoundary() {
  return (
    <main dir="rtl" aria-label="التحقق من الجلسة" className="min-h-dvh bg-background">
      <FullPageSpinner label="جارٍ التحقق من الجلسة..." />
    </main>
  )
}

function ScopeGate({ unavailable }: { unavailable: boolean }) {
  const title = unavailable ? 'لا يتوفر نطاق عمل' : 'اختيار نطاق العمل مطلوب'
  const description = unavailable
    ? 'لا توجد صلاحيات نطاق فعّالة مرتبطة بحسابك حالياً. تواصل مع مسؤول النظام للمساعدة.'
    : 'يلزم اختيار نطاق العمل المعتمد قبل الوصول إلى صفحات النظام.'

  return (
    <main
      dir="rtl"
      aria-labelledby="scope-gate-title"
      className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-8"
    >
      <section className="w-full max-w-lg rounded-2xl border border-border bg-popover p-8 text-center shadow-modal sm:p-10">
        <span
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-primary"
          aria-hidden
        >
          {unavailable ? <IconLockAccess className="size-7" /> : <IconRoute className="size-7" />}
        </span>
        <h1 id="scope-gate-title" className="mt-5 text-2xl font-bold text-foreground">
          {title}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
        {!unavailable ? (
          <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-foreground">
            ستتوفر قائمة النطاقات المصرّح بها في هذه الصفحة.
          </p>
        ) : null}
      </section>
    </main>
  )
}

/**
 * Keeps public login content out of the app shell while hydration is pending
 * and sends already-authenticated users to the right contract-backed gate.
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

  if (session.scopeState === 'SelectionRequired') {
    return <Navigate to={ROUTE_PATHS.scopeSelect} replace />
  }

  if (session.scopeState === 'Unavailable') {
    return <Navigate to={ROUTE_PATHS.noAccess} replace />
  }

  return <Navigate to={ROUTE_PATHS.dashboard} replace />
}

/** Blocks all feature routes until an authenticated session has an active scope. */
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

  if (session.scopeState === 'SelectionRequired') {
    return <Navigate to={ROUTE_PATHS.scopeSelect} replace />
  }

  if (session.scopeState === 'Unavailable') {
    return <Navigate to={ROUTE_PATHS.noAccess} replace />
  }

  return <>{children}</>
}

/** Presents the minimal authenticated scope-selection gate, without owning selection UI. */
function ScopeSelectionRoute() {
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

  if (session.scopeState === 'Unavailable') {
    return <Navigate to={ROUTE_PATHS.noAccess} replace />
  }

  if (session.scopeState === 'Selected') {
    return <Navigate to={ROUTE_PATHS.dashboard} replace />
  }

  return <ScopeGate unavailable={false} />
}

/** Presents the contact-administrator state for an authenticated user without scope access. */
function NoAccessRoute() {
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

  if (session.scopeState === 'SelectionRequired') {
    return <Navigate to={ROUTE_PATHS.scopeSelect} replace />
  }

  if (session.scopeState === 'Selected') {
    return <Navigate to={ROUTE_PATHS.dashboard} replace />
  }

  return <ScopeGate unavailable />
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
  ScopeSelectionRoute,
}
