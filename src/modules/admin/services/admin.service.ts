import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type {
  paths,
  ReplaceRoleScopesRequest,
  UserPage,
  UserRoleScope,
  UserSummary,
  UserUpsertRequest,
} from '@/shared/types/generated/eiams-v1'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'
import type {
  CreateRoleRequest,
  PermissionCatalogEntry,
  ReplaceRolePermissionsRequest,
  RoleProjection,
  UpdateRoleMetadataRequest,
} from '@/modules/admin/types/role.types'

const PERMISSIONS_PATH = '/admin/permissions' satisfies keyof paths
const ROLES_PATH = '/admin/roles' satisfies keyof paths
const USERS_PATH = '/admin/users' satisfies keyof paths
const USER_PATH = '/admin/users/{userId}' satisfies keyof paths
const USER_ROLE_SCOPES_PATH = '/admin/users/{userId}/role-scopes' satisfies keyof paths

// Declared locally rather than with `satisfies keyof paths`: the generated `paths`
// map is the stale provisional artifact, and it still advertises the one-at-a-time
// role-permission writes this surface no longer uses (D-INT-02 / ADR-0001).
const ROLE_PATH = '/admin/roles/{roleId}'
const ROLE_PERMISSIONS_PATH = '/admin/roles/{roleId}/permissions'

/**
 * The catalogue and role list are paged server-side with pagination carried at the
 * top level of the envelope. Reading them through `request` would silently truncate
 * at the default page size of 20, which is below the 29-permission catalogue, so
 * both go through `requestPage`.
 */
const FULL_PAGE_QUERY = { page: 1, pageSize: 100 } as const

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface AdminService {
  listPermissions: () => Promise<readonly PermissionCatalogEntry[]>
  listRoles: () => Promise<readonly RoleProjection[]>
  getRole: (roleId: string) => Promise<RoleProjection>
  createRole: (request: CreateRoleRequest) => Promise<RoleProjection>
  /** Metadata only; permission membership is `replaceRolePermissions`. */
  updateRoleMetadata: (
    roleId: string,
    request: UpdateRoleMetadataRequest,
  ) => Promise<RoleProjection>
  /** Wholesale permission replacement; carries no metadata fields. */
  replaceRolePermissions: (
    roleId: string,
    request: ReplaceRolePermissionsRequest,
  ) => Promise<RoleProjection>
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
      const page = await transport.requestPage<PermissionCatalogEntry>({
        path: PERMISSIONS_PATH,
        method: 'GET',
        query: FULL_PAGE_QUERY,
      })
      return page.items
    },
    async listRoles() {
      const page = await transport.requestPage<RoleProjection>({
        path: ROLES_PATH,
        method: 'GET',
        query: FULL_PAGE_QUERY,
      })
      return page.items
    },
    async getRole(roleId) {
      return await transport.request<RoleProjection>({
        path: pathWithId(ROLE_PATH, '{roleId}', roleId),
        method: 'GET',
      })
    },
    async createRole(request) {
      // Answers 201 with the authoritative role projection, not a bare id: the role
      // and its grants are created as one atomic unit, so the response IS the aggregate.
      return await transport.request<RoleProjection>({
        path: ROLES_PATH,
        method: 'POST',
        body: request,
      })
    },
    async updateRoleMetadata(roleId, request) {
      return await transport.request<RoleProjection>({
        path: pathWithId(ROLE_PATH, '{roleId}', roleId),
        method: 'PUT',
        body: request,
      })
    },
    async replaceRolePermissions(roleId, request) {
      return await transport.request<RoleProjection>({
        path: pathWithId(ROLE_PERMISSIONS_PATH, '{roleId}', roleId),
        method: 'PUT',
        body: request,
      })
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
