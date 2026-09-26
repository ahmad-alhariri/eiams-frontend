import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type {
  ReplaceRoleScopeRequest,
  ReplaceRoleScopeResponse,
  UserRoleScope,
} from '@/modules/admin/types/admin.api-types'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'
import type {
  paths,
  Permission,
  Role,
  RoleUpsertRequest,
  UserPage,
  UserSummary,
  UserUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

const PERMISSIONS_PATH = '/admin/permissions' satisfies keyof paths
const ROLES_PATH = '/admin/roles' satisfies keyof paths
const ROLE_PATH = '/admin/roles/{roleId}' satisfies keyof paths
const USERS_PATH = '/admin/users' satisfies keyof paths
const USER_PATH = '/admin/users/{userId}' satisfies keyof paths
// Singular assignment path (D-SRS-01); intentionally not `satisfies keyof paths`
// because the versioned generated contract still exposes the legacy plural path.
const USER_ROLE_SCOPE_PATH = '/admin/users/{userId}/role-scope'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface AdminService {
  listPermissions: () => Promise<readonly Permission[]>
  listRoles: () => Promise<readonly Role[]>
  getRole: (roleId: string) => Promise<Role>
  createRole: (request: RoleUpsertRequest) => Promise<Role>
  updateRole: (roleId: string, request: RoleUpsertRequest) => Promise<Role>
  listUsers: (query: ListUsersQuery) => Promise<UserPage>
  getUser: (userId: string) => Promise<UserSummary>
  createUser: (request: UserUpsertRequest) => Promise<UserSummary>
  updateUser: (userId: string, request: UserUpsertRequest) => Promise<UserSummary>
  getUserRoleScope: (userId: string) => Promise<UserRoleScope>
  replaceUserRoleScope: (
    userId: string,
    request: ReplaceRoleScopeRequest,
  ) => Promise<ReplaceRoleScopeResponse>
}

/**
 * Contract-only administration transport for the application Axios boundary.
 * Authorization, scope validation, concurrency, and access recomputation
 * remain server-authoritative.
 */
export function createAdminService(client: AxiosInstance): AdminService {
  return {
    async listPermissions() {
      const response = await client.get<readonly Permission[]>(PERMISSIONS_PATH)
      return response.data
    },
    async listRoles() {
      const response = await client.get<readonly Role[]>(ROLES_PATH)
      return response.data
    },
    async getRole(roleId) {
      const response = await client.get<Role>(pathWithId(ROLE_PATH, '{roleId}', roleId))
      return response.data
    },
    async createRole(request) {
      const response = await client.post<Role>(ROLES_PATH, request)
      return response.data
    },
    async updateRole(roleId, request) {
      const response = await client.put<Role>(pathWithId(ROLE_PATH, '{roleId}', roleId), request)
      return response.data
    },
    async listUsers(query) {
      const response = await client.get<UserPage>(USERS_PATH, { params: query })
      return response.data
    },
    async getUser(userId) {
      const response = await client.get<UserSummary>(pathWithId(USER_PATH, '{userId}', userId))
      return response.data
    },
    async createUser(request) {
      const response = await client.post<UserSummary>(USERS_PATH, request)
      return response.data
    },
    async updateUser(userId, request) {
      const response = await client.put<UserSummary>(
        pathWithId(USER_PATH, '{userId}', userId),
        request,
      )
      return response.data
    },
    async getUserRoleScope(userId) {
      const response = await client.get<UserRoleScope>(
        pathWithId(USER_ROLE_SCOPE_PATH, '{userId}', userId),
      )
      return response.data
    },
    async replaceUserRoleScope(userId, request) {
      const response = await client.put<ReplaceRoleScopeResponse>(
        pathWithId(USER_ROLE_SCOPE_PATH, '{userId}', userId),
        request,
      )
      return response.data
    },
  }
}

export const adminService = createAdminService(apiClient)
