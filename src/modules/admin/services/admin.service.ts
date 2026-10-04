import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type {
  paths,
  Permission,
  ReplaceRoleScopesRequest,
  Role,
  RoleUpsertRequest,
  UserPage,
  UserRoleScope,
  UserSummary,
  UserUpsertRequest,
} from '@/shared/types/generated/eiams-v1'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'

const PERMISSIONS_PATH = '/admin/permissions' satisfies keyof paths
const ROLES_PATH = '/admin/roles' satisfies keyof paths
const ROLE_PATH = '/admin/roles/{roleId}' satisfies keyof paths
const USERS_PATH = '/admin/users' satisfies keyof paths
const USER_PATH = '/admin/users/{userId}' satisfies keyof paths
const USER_ROLE_SCOPES_PATH = '/admin/users/{userId}/role-scopes' satisfies keyof paths

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
  getUserRoleScopes: (userId: string) => Promise<readonly UserRoleScope[]>
  replaceUserRoleScopes: (
    userId: string,
    request: ReplaceRoleScopesRequest,
  ) => Promise<readonly UserRoleScope[]>
}

/**
 * Contract-only administration transport for the application Axios boundary.
 * Authorization, scope validation, concurrency, and access recomputation
 * remain server-authoritative.
 */
export function createAdminService(transport: ApiTransport): AdminService {
  return {
    async listPermissions() {
      const response = await transport.request<readonly Permission[]>({
        path: PERMISSIONS_PATH,
        method: 'GET',
      })
      return response
    },
    async listRoles() {
      const response = await transport.request<readonly Role[]>({ path: ROLES_PATH, method: 'GET' })
      return response
    },
    async getRole(roleId) {
      const response = await transport.request<Role>({
        path: pathWithId(ROLE_PATH, '{roleId}', roleId),
        method: 'GET',
      })
      return response
    },
    async createRole(request) {
      const response = await transport.request<Role>({
        path: ROLES_PATH,
        method: 'POST',
        body: request,
      })
      return response
    },
    async updateRole(roleId, request) {
      const response = await transport.request<Role>({
        path: pathWithId(ROLE_PATH, '{roleId}', roleId),
        method: 'PUT',
        body: request,
      })
      return response
    },
    async listUsers(query) {
      const page = await transport.requestPage<UserSummary>({
        path: USERS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      // The generated `UserPage` described a body the backend never sends on its
      // own; rebuild the documented view-model from the normalized `ApiPage` so
      // the declared type and the runtime value describe the same thing.
      return {
        items: page.items,
        meta: {
          pageIndex: page.page - 1,
          page: page.page,
          pageSize: page.pageSize,
          itemCount: page.totalItems,
          totalItems: page.totalItems,
          totalCount: page.totalItems,
          totalPages: page.totalPages,
          hasNextPage: page.hasNextPage,
          hasPreviousPage: page.hasPreviousPage,
        },
      } as UserPage
    },
    async getUser(userId) {
      const response = await transport.request<UserSummary>({
        path: pathWithId(USER_PATH, '{userId}', userId),
        method: 'GET',
      })
      return response
    },
    async createUser(request) {
      const response = await transport.request<UserSummary>({
        path: USERS_PATH,
        method: 'POST',
        body: request,
      })
      return response
    },
    async updateUser(userId, request) {
      const response = await transport.request<UserSummary>({
        path: pathWithId(USER_PATH, '{userId}', userId),
        method: 'PUT',
        body: request,
      })
      return response
    },
    async getUserRoleScopes(userId) {
      const response = await transport.request<readonly UserRoleScope[]>({
        path: pathWithId(USER_ROLE_SCOPES_PATH, '{userId}', userId),
        method: 'GET',
      })
      return response
    },
    async replaceUserRoleScopes(userId, request) {
      const response = await transport.request<readonly UserRoleScope[]>({
        path: pathWithId(USER_ROLE_SCOPES_PATH, '{userId}', userId),
        method: 'PUT',
        body: request,
      })
      return response
    },
  }
}

export const adminService = createAdminService(apiTransport)
