/**
 * Handwritten wire contracts for the user administration surface
 * (D-INT-02 / ADR-0001).
 *
 * These replace the generated `UserSummary` / `UserPage` / `UserUpsertRequest`,
 * which described records the backend never served: a `displayName` it does not
 * compose, a `userId` it names `id`, a `username` it does not return on any read,
 * and a `rowVersion` that exists on no user projection at all. The generated
 * `paths` map also cannot be trusted here: the list endpoint binds `page` while
 * the client sent `pageIndex`, which the server silently ignored.
 *
 * Backend sources of truth:
 *  - `Application.Users.GetList.UserAdministrationResponse`
 *  - `Application.Users.GetById.UserResponse`
 *  - `Web.Api.Controllers.Users.CreateUserController-RequestBody`
 *  - `Web.Api.Controllers.Users.UpdateUserController-RequestBody`
 */

import type { RoleScopeType, UserRoleScopeProjection } from '@/modules/admin/types/role.types'

/** Account state. `Domain.Users.UserStatus` on the backend. */
export type UserAccountStatus = 'Active' | 'Suspended'

/**
 * One row of the administration directory.
 *
 * Distinct from {@link UserDetailProjection} because the backend serves two
 * different records: the list additionally carries the user's sole role-and-scope
 * assignment, while the detail read does not.
 */
export interface UserDirectoryRow {
  readonly id: string
  readonly email: string
  /** The login identifier. Served on reads; the backend no longer makes it write-only. */
  readonly username: string
  /**
   * Concurrency token to submit as `expectedRowVersion` on the next write.
   * Advances on every profile or status change.
   */
  readonly rowVersion: number
  readonly firstName: string
  readonly lastName: string
  readonly employeeId?: string | null
  readonly employeeName?: string | null
  readonly status: UserAccountStatus
  /** ISO-8601 UTC timestamp; absent when the user has never signed in. */
  readonly lastLoginUtc?: string | null
  readonly createdAtUtc: string
  /** The sole assignment. All three are null when the user has none yet. */
  readonly roleId?: string | null
  readonly roleName?: string | null
  readonly scopeType?: RoleScopeType | null
  readonly scopeId?: string | null
}

/** The single-user read. Carries no assignment; the role comes from the role-scope read. */
export interface UserDetailProjection {
  readonly id: string
  readonly email: string
  /** The login identifier, immutable after creation. */
  readonly username: string
  /**
   * Concurrency token to submit as `expectedRowVersion` on the next write.
   * Advances on every profile or status change.
   */
  readonly rowVersion: number
  readonly firstName: string
  readonly lastName: string
  readonly employeeId?: string | null
  readonly employeeName?: string | null
  readonly status: UserAccountStatus
  readonly lastLoginUtc?: string | null
  readonly createdAtUtc: string
}

/**
 * Account creation.
 *
 * The role and scope are REQUIRED and inline: D-SRS-01 makes the account and its
 * sole assignment one server-owned operation, and the backend rejects an omitted
 * assignment rather than creating a zero-assignment account.
 */
export interface CreateUserRequest {
  readonly email: string
  readonly username: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly roleId: string
  readonly scopeType: RoleScopeType
  readonly scopeId?: string | null
}

/**
 * The created account as the server stored it.
 *
 * `assignment` is the sole role-and-scope row, returned so the client adopts the
 * authoritative version instead of re-reading it.
 */
export interface CreatedUser {
  readonly id: string
  readonly email: string
  readonly username: string
  readonly firstName: string
  readonly lastName: string
  readonly assignment: UserRoleScopeProjection
}

/**
 * Account metadata update: display name and email ONLY.
 *
 * No `username`: the login is immutable after creation and the backend no longer
 * binds the field, so a rename cannot be applied. Measured against the running API:
 * a body that still carries it is accepted and the field is SILENTLY IGNORED — safe,
 * but not loudly rejected — so this client never sends it in the first place.
 *
 * No `status`: suspension is its own operation ({@link SetUserStatusRequest}), which
 * carries the security guards and revokes refresh tokens. Folding it into a broad
 * upsert is the defect RESOLUTION-027 already retired for roles.
 *
 * `expectedRowVersion` is REQUIRED: the backend binds it with `JsonRequired` and
 * answers a stale value with 409 `USERS_ROW_VERSION_MISMATCH`, so a stale save is a
 * conflict to review rather than a silent overwrite.
 */
export interface UpdateUserRequest {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly expectedRowVersion: number
}

/**
 * Activate or suspend an account.
 *
 * A dedicated operation so a status change never has to replay fields the caller may
 * not be able to read — the trapdoor that made suspension impossible while the
 * backend required a `username` no read projection returned.
 */
export interface SetUserStatusRequest {
  readonly status: UserAccountStatus
  /** Required; a stale value is refused with 409 rather than applied. */
  readonly expectedRowVersion: number
}

/** Server-side filters for the directory. `page` is 1-based, as the backend binds it. */
export interface ListUsersRequest {
  readonly search?: string
  readonly status?: UserAccountStatus
  readonly hasRoleScope?: boolean
  readonly page?: number
  readonly pageSize?: number
}

/**
 * Paging totals for the directory table.
 *
 * `pageIndex` is the 0-based value the shared table controls use; `page` is the
 * 1-based value the server echoes. Both are present because the UI reads one and
 * the transport the other, and conflating them is how `page=1` became `pageIndex=0`
 * across this codebase.
 */
export interface UserDirectoryMeta {
  readonly pageIndex: number
  readonly page: number
  readonly pageSize: number
  readonly itemCount: number
  readonly totalItems: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
  readonly hasPreviousPage: boolean
}

/**
 * A page of the directory.
 *
 * The backend sends `data` as a BARE ARRAY with `pagination` as a sibling, so this
 * view-model is assembled by the service rather than read off the wire. The
 * generated `UserPage` claimed the server returned `{items, meta}`.
 */
export interface UserDirectoryPage {
  readonly items: readonly UserDirectoryRow[]
  readonly meta: UserDirectoryMeta
}

/**
 * The display name the UI renders, composed from the two fields the server
 * actually sends.
 *
 * The backend never returns a combined name, so this is a presentation concern
 * and lives here rather than being invented per component.
 */
export function userDisplayName(user: Pick<UserDirectoryRow, 'firstName' | 'lastName'>): string {
  return [user.firstName.trim(), user.lastName.trim()].filter((part) => part !== '').join(' ')
}
