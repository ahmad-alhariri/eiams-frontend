import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import type { PermissionCode } from '@/config/permissions'
import { ROUTE_METADATA, type RouteKey } from '@/config/routes'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

export interface PermissionPredicates {
  has: (code: PermissionCode) => boolean
  hasAll: (codes: readonly PermissionCode[]) => boolean
  hasAny: (codes: readonly PermissionCode[]) => boolean
}

/**
 * Evaluates one canonical v1 permission against the server-authored effective
 * permissions of the active session scope. Unknown values returned by the
 * open OpenAPI array are harmless because callers can request only the typed
 * D-RBAC-01 vocabulary.
 */
export function hasPermission(permissionCodes: readonly string[], code: PermissionCode): boolean {
  return permissionCodes.includes(code)
}

/** A route/action needing every code passes only when each code is effective. */
export function hasAllPermissions(
  permissionCodes: readonly string[],
  codes: readonly PermissionCode[],
): boolean {
  return codes.every((code) => hasPermission(permissionCodes, code))
}

/** A route/action with alternative entry capabilities needs one effective code. */
export function hasAnyPermission(
  permissionCodes: readonly string[],
  codes: readonly PermissionCode[],
): boolean {
  return codes.some((code) => hasPermission(permissionCodes, code))
}

/**
 * Resolves a route's D-RBAC-01 metadata without making an authentication,
 * hydration, scope-selection, or navigation decision. Route guards compose
 * this predicate with those separate concerns.
 */
export function hasRoutePermission(permissionCodes: readonly string[], route: RouteKey): boolean {
  const metadata = ROUTE_METADATA[route]

  return (
    hasAllPermissions(permissionCodes, metadata.permissions ?? []) &&
    (metadata.permissionAny === undefined ||
      hasAnyPermission(permissionCodes, metadata.permissionAny))
  )
}

/**
 * Query-backed permission predicates for route, navigation, and action
 * visibility. This observer never fetches or caches a second session; the
 * application hydration flow owns the sole session query.
 */
export function usePermission(): PermissionPredicates {
  const { data: session } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const effectivePermissions = useMemo(() => new Set(session?.permissionCodes ?? []), [session])

  const has = useCallback(
    (code: PermissionCode) => effectivePermissions.has(code),
    [effectivePermissions],
  )
  const hasAll = useCallback(
    (codes: readonly PermissionCode[]) => codes.every((code) => effectivePermissions.has(code)),
    [effectivePermissions],
  )
  const hasAny = useCallback(
    (codes: readonly PermissionCode[]) => codes.some((code) => effectivePermissions.has(code)),
    [effectivePermissions],
  )

  return { has, hasAll, hasAny }
}

/** Query-backed convenience predicate over one canonical route registry key. */
export function useRoutePermission(route: RouteKey): boolean {
  const { hasAll, hasAny } = usePermission()
  const metadata = ROUTE_METADATA[route]

  return (
    hasAll(metadata.permissions ?? []) &&
    (metadata.permissionAny === undefined || hasAny(metadata.permissionAny))
  )
}
