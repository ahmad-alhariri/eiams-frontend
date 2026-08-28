import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adminService } from '@/modules/admin/services/admin.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  ReplaceRoleScopesRequest,
  RoleUpsertRequest,
  UserUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

type UpdateRoleVariables = { roleId: string; request: RoleUpsertRequest }
type UpdateUserVariables = { userId: string; request: UserUpsertRequest }
type ReplaceUserRoleScopesVariables = { userId: string; request: ReplaceRoleScopesRequest }

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

export function useCreateRoleMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: adminService.createRole, onSuccess: invalidate })
}

export function useUpdateRoleMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ roleId, request }: UpdateRoleVariables) =>
      adminService.updateRole(roleId, request),
    onSuccess: invalidate,
  })
}

export function useCreateUserMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: adminService.createUser, onSuccess: invalidate })
}

export function useUpdateUserMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, request }: UpdateUserVariables) =>
      adminService.updateUser(userId, request),
    onSuccess: invalidate,
  })
}

export function useReplaceUserRoleScopesMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, request }: ReplaceUserRoleScopesVariables) =>
      adminService.replaceUserRoleScopes(userId, request),
    onSuccess: invalidate,
  })
}
