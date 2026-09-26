import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adminService } from '@/modules/admin/services/admin.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'
import type { ReplaceRoleScopeRequest } from '@/modules/admin/types/admin.api-types'
import type { RoleUpsertRequest, UserUpsertRequest } from '@/shared/types/generated/eiams-v1'

type UpdateRoleVariables = { roleId: string; request: RoleUpsertRequest }
type UpdateUserVariables = { userId: string; request: UserUpsertRequest }
type ReplaceUserRoleScopeVariables = { userId: string; request: ReplaceRoleScopeRequest }

function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey !== undefined) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(activeScopeCacheKey, 'admin'),
        exact: false,
      })
    }

    // Role definitions and assignments can change the current session's
    // server-calculated effective permissions. The session remains its source.
    await queryClient.invalidateQueries({ queryKey: authSessionQueryKey })
  }
}

/**
 * Installs an authoritative mutation result into the cache so the UI reflects
 * the server-returned state without waiting for a stale refetch.
 */
function installRole(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  role: { roleId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'admin', 'roles', role.roleId), role)
}

function installUser(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  user: { userId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'admin', 'users', user.userId), user)
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: adminService.createRole,
    onSuccess: (result) => {
      installRole(queryClient, activeScopeCacheKey, result)
      void invalidate()
    },
  })
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ roleId, request }: UpdateRoleVariables) =>
      adminService.updateRole(roleId, request),
    onSuccess: (result) => {
      installRole(queryClient, activeScopeCacheKey, result)
      void invalidate()
    },
  })
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: adminService.createUser,
    onSuccess: (result) => {
      installUser(queryClient, activeScopeCacheKey, result)
      void invalidate()
    },
  })
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, request }: UpdateUserVariables) =>
      adminService.updateUser(userId, request),
    onSuccess: (result) => {
      installUser(queryClient, activeScopeCacheKey, result)
      void invalidate()
    },
  })
}

export function useReplaceUserRoleScopeMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, request }: ReplaceUserRoleScopeVariables) =>
      adminService.replaceUserRoleScope(userId, request),
    onSuccess: (result, variables) => {
      // The returned assignment is authoritative for this user's role scope.
      if (activeScopeCacheKey !== undefined && variables?.userId) {
        queryClient.setQueryData(
          queryKeys.scoped(activeScopeCacheKey, 'admin', 'users', variables.userId, 'role-scope'),
          result,
        )
      }
      void invalidate()
    },
  })
}
