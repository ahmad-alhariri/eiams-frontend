import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adminService } from '@/modules/admin/services/admin.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { queryKeys } from '@/shared/services/query-keys'
import type { ReplaceRoleScopesRequest, UserUpsertRequest } from '@/shared/types/generated/eiams-v1'
import type {
  ReplaceRolePermissionsRequest,
  UpdateRoleMetadataRequest,
} from '@/modules/admin/types/role.types'

type UpdateRoleMetadataVariables = { roleId: string; request: UpdateRoleMetadataRequest }
type ReplaceRolePermissionsVariables = {
  roleId: string
  request: ReplaceRolePermissionsRequest
}
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

/**
 * Role metadata only. Permission membership has its own mutation
 * (`useReplaceRolePermissionsMutation`) because the two are separate server
 * operations with separate authority, and because a broad upsert that carried
 * both would let a metadata save silently rewrite permissions.
 */
export function useUpdateRoleMetadataMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ roleId, request }: UpdateRoleMetadataVariables) =>
      adminService.updateRoleMetadata(roleId, request),
    onSuccess: invalidate,
  })
}

/**
 * Wholesale permission replacement for one role.
 *
 * A 409 means someone else changed the role after this form was loaded. The
 * response is discarded and the admin query is invalidated rather than the write
 * being replayed: replaying a stale broad form is how a concurrent permission
 * change gets overwritten.
 */
export function useReplaceRolePermissionsMutation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ roleId, request }: ReplaceRolePermissionsVariables) =>
      adminService.replaceRolePermissions(roleId, request),
    onSuccess: invalidate,
    onError: invalidate,
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
