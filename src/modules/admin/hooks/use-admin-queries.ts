import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adminService } from '@/modules/admin/services/admin.service'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'
import { MASTER_DATA_STALE_TIME, OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const ADMIN_RESOURCE = 'admin'
const EMPTY_QUERY = {} as const

export const adminQueryKeys = {
  permissions: (scope: ScopeCacheKey) => queryKeys.scoped(scope, ADMIN_RESOURCE, 'permissions'),
  roles: (scope: ScopeCacheKey) => queryKeys.scoped(scope, ADMIN_RESOURCE, 'roles'),
  role: (scope: ScopeCacheKey, roleId: string) =>
    queryKeys.scoped(scope, ADMIN_RESOURCE, 'roles', roleId),
  users: (scope: ScopeCacheKey, query: ListUsersQuery) =>
    queryKeys.scoped(scope, ADMIN_RESOURCE, 'users', query),
  user: (scope: ScopeCacheKey, userId: string) =>
    queryKeys.scoped(scope, ADMIN_RESOURCE, 'users', userId),
  userRoleScopes: (scope: ScopeCacheKey, userId: string) =>
    queryKeys.scoped(scope, ADMIN_RESOURCE, 'users', userId, 'role-scopes'),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

/** Permission codes are catalog reference data used by role administration. */
export function usePermissionsQuery() {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ADMIN_RESOURCE, 'permissions')
        : adminQueryKeys.permissions(scope),
    queryFn: adminService.listPermissions,
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useRolesQuery() {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined ? queryKeys.public(ADMIN_RESOURCE, 'roles') : adminQueryKeys.roles(scope),
    queryFn: adminService.listRoles,
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useRoleQuery(roleId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || roleId === undefined
        ? queryKeys.public(ADMIN_RESOURCE, 'roles', roleId)
        : adminQueryKeys.role(scope, roleId),
    queryFn: () => adminService.getRole(roleId ?? ''),
    enabled: scope !== undefined && roleId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUsersQuery(query: ListUsersQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ADMIN_RESOURCE, 'users', query)
        : adminQueryKeys.users(scope, query),
    queryFn: () => adminService.listUsers(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useUserQuery(userId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || userId === undefined
        ? queryKeys.public(ADMIN_RESOURCE, 'users', userId)
        : adminQueryKeys.user(scope, userId),
    queryFn: () => adminService.getUser(userId ?? ''),
    enabled: scope !== undefined && userId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useUserRoleScopesQuery(userId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || userId === undefined
        ? queryKeys.public(ADMIN_RESOURCE, 'users', userId, 'role-scopes')
        : adminQueryKeys.userRoleScopes(scope, userId),
    queryFn: () => adminService.getUserRoleScopes(userId ?? ''),
    enabled: scope !== undefined && userId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
