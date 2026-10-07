import { readTransportError } from '@/shared/api/envelope'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { paths } from '@/shared/types/generated/eiams-v1'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'
import type {
  CreatedUser,
  CreateUserRequest,
  SetUserStatusRequest,
  UpdateUserRequest,
  UserDetailProjection,
  UserDirectoryPage,
  UserDirectoryRow,
} from '@/modules/admin/types/user.types'
import type {
  CreateRoleRequest,
  PermissionCatalogEntry,
  ReplaceRolePermissionsRequest,
  ReplaceUserRoleScopeRequest,
  RoleProjection,
  UpdateRoleMetadataRequest,
  UserRoleScopeProjection,
} from '@/modules/admin/types/role.types'

const PERMISSIONS_PATH = '/admin/permissions' satisfies keyof paths
const ROLES_PATH = '/admin/roles' satisfies keyof paths
const USERS_PATH = '/admin/users' satisfies keyof paths
const USER_PATH = '/admin/users/{userId}' satisfies keyof paths

/**
 * Suspending an account is its own operation: it carries the security guards and
 * revokes every live refresh token, and it no longer requires replaying a profile the
 * caller may not be able to read. Declared locally for the same reason as the other
 * role and assignment routes — the generated paths map predates it.
 */
const USER_STATUS_PATH = '/admin/users/{userId}/status'

// Declared locally rather than with `satisfies keyof paths`: the generated `paths`
// map is the stale provisional artifact, and it still advertises the one-at-a-time
// role-permission writes this surface no longer uses (D-INT-02 / ADR-0001).
const ROLE_PATH = '/admin/roles/{roleId}'
const ROLE_PERMISSIONS_PATH = '/admin/roles/{roleId}/permissions'

/**
 * The singular assignment resource (D-SRS-01). Every user has exactly one
 * role-and-scope assignment, so the resource is `role-scope`, never a plural
 * collection. The generated `paths` map still publishes only the retired
 * `role-scopes` route, which the backend answers with 404.
 */
const USER_ROLE_SCOPE_PATH = '/admin/users/{userId}/role-scope'

/**
 * Server error code for a user that has no assignment yet; a normal empty state.
 *
 * Compared in its NORMALIZED form. The backend authors it in C# as
 * `UserRoleScopes.AssignmentNotFound`, and both sides uppercase it:
 * `ApiResults.NormalizeErrorCode` server-side and `normalizeWireErrorCode` in
 * `shared/api/envelope.ts`, which `normalizeApiError` has already applied.
 */
const ASSIGNMENT_NOT_FOUND_CODE = 'USER_ROLE_SCOPES_ASSIGNMENT_NOT_FOUND'

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
  listUsers: (query: ListUsersQuery) => Promise<UserDirectoryPage>
  getUser: (userId: string) => Promise<UserDetailProjection>
  createUser: (request: CreateUserRequest) => Promise<CreatedUser>
  /** Answers an empty body, so it resolves to void and the caller re-reads. */
  updateUser: (userId: string, request: UpdateUserRequest) => Promise<void>
  /** Activate or suspend; also answers an empty body. */
  setUserStatus: (userId: string, request: SetUserStatusRequest) => Promise<void>
  /**
   * The user's sole assignment, or `null` when they have none yet.
   *
   * A user with no assignment is a legitimate intermediate state (the account
   * exists, the row does not), so the backend's 404 `AssignmentNotFound` is
   * translated to `null` rather than surfaced as a failure. Every other error
   * still propagates, INCLUDING a 404 for an unknown user: matching the status
   * alone would render a real failure as an empty assignment.
   */
  getUserRoleScope: (userId: string) => Promise<UserRoleScopeProjection | null>
  /**
   * Atomic replacement of the sole assignment; returns the stored projection
   * including its new `rowVersion`. The response IS the assignment, so the client
   * adopts it instead of re-reading.
   */
  replaceUserRoleScope: (
    userId: string,
    request: ReplaceUserRoleScopeRequest,
  ) => Promise<UserRoleScopeProjection>
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
      const page = await transport.requestPage<UserDirectoryRow>({
        path: USERS_PATH,
        method: 'GET',
        // `page` is 1-based on the wire. The generated operations map advertised
        // `pageIndex`, which the backend does not bind: it was ignored and every
        // "page 2" request silently returned page 1.
        query: query as Record<string, string | number | boolean | undefined>,
      })
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
      }
    },
    async getUser(userId) {
      return await transport.request<UserDetailProjection>({
        path: pathWithId(USER_PATH, '{userId}', userId),
        method: 'GET',
      })
    },
    async createUser(request) {
      // Answers 201 with the created account AND its sole assignment: the account
      // and the assignment are one server-owned operation (D-SRS-01).
      return await transport.request<CreatedUser>({
        path: USERS_PATH,
        method: 'POST',
        body: request,
      })
    },
    async updateUser(userId, request) {
      // EmptyResponse: there is nothing to adopt, so the caller invalidates and
      // re-reads rather than assuming the submitted values are now the truth.
      await transport.requestEmpty({
        path: pathWithId(USER_PATH, '{userId}', userId),
        method: 'PUT',
        body: request,
      })
    },
    async setUserStatus(userId, request) {
      await transport.requestEmpty({
        path: pathWithId(USER_STATUS_PATH, '{userId}', userId),
        method: 'PUT',
        body: request,
      })
    },
    async getUserRoleScope(userId) {
      try {
        return await transport.request<UserRoleScopeProjection>({
          path: pathWithId(USER_ROLE_SCOPE_PATH, '{userId}', userId),
          method: 'GET',
        })
      } catch (error: unknown) {
        // A user with no assignment yet is a legitimate state, not a failure:
        // `GetUserRoleScopeQueryHandler` returns `AssignmentNotFound` when the row
        // is absent, and `ReplaceUserRoleScopeCommandHandler` expects
        // `expectedRowVersion: 0` for that same first write. Matching the CODE as
        // well as the status keeps a genuine 404 (unknown user, or an assignment
        // outside the administrator's scope) an error.
        //
        // Read through `readTransportError` rather than `normalizeApiError`: the
        // service-layer lint rule forbids the latter, because it resolves the Arabic
        // presentation copy and no Arabic belongs in a transport decision.
        const transportError = readTransportError(error)
        if (transportError?.status === 404 && transportError.code === ASSIGNMENT_NOT_FOUND_CODE) {
          return null
        }
        throw error
      }
    },
    async replaceUserRoleScope(userId, request) {
      return await transport.request<UserRoleScopeProjection>({
        path: pathWithId(USER_ROLE_SCOPE_PATH, '{userId}', userId),
        method: 'PUT',
        body: request,
      })
    },
  }
}

export const adminService = createAdminService(apiTransport)
