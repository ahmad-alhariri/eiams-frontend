/**
 * Handwritten wire contracts for the role administration surface (D-INT-02 / ADR-0001).
 *
 * These replace the stale generated `Role` / `RoleUpsertRequest` shapes, which
 * described a record the backend never served: a `code` field the backend does
 * not have, a `status` field it does not have, and a single broad upsert body
 * that RESOLUTION-027 §1 and §25 forbid because metadata and permission
 * membership are separate operations with separate authority.
 *
 * Backend source of truth: `Application.Roles.RoleResponse` plus the
 * `POST /admin/roles`, `PUT /admin/roles/{roleId}` and
 * `PUT /admin/roles/{roleId}/permissions` request bodies.
 */

/**
 * Assignment scope types. `UserAssignmentScopeType` on the backend;
 * OrganizationalUnit is never an assignment scope (RESOLUTION-013).
 *
 * The backend serialises this enum through an explicit `JsonStringEnumConverter`,
 * so the wire value is the member name and never the ordinal.
 */
export type RoleScopeType = 'Enterprise' | 'Site' | 'Warehouse'

/** Arabic display labels for the assignment scope types (ui-design.md, RTL-first). */
export const ROLE_SCOPE_TYPE_LABELS_AR: Readonly<Record<RoleScopeType, string>> = {
  Enterprise: 'مستوى المؤسسة',
  Site: 'موقع',
  Warehouse: 'مستودع',
}

/**
 * The single authoritative role projection. Served by the list read, the detail
 * read, and both write results, so a client adopts the response of a write
 * instead of re-reading it.
 */
export interface RoleProjection {
  /** Stable role identifier. */
  readonly id: string
  /**
   * The role code (`WH_MGR`), NOT a display label. It identifies the role and is
   * what assignments and permission references point at.
   */
  readonly name: string
  /** Arabic display label; this is what the UI renders as the role's name. */
  readonly nameAr: string
  readonly description: string | null
  /** Scopes this role may be assigned at. */
  readonly allowedScopeTypes: readonly RoleScopeType[]
  /** The role's complete dotted permission-code set. */
  readonly permissionCodes: readonly string[]
  /**
   * Aggregate version shared by metadata updates and permission replacements.
   * Submit the value last read; a mismatch is a conflict, not a silent overwrite.
   */
  readonly rowVersion: number
}

/** One entry of the server-owned permission catalogue. */
export interface PermissionCatalogEntry {
  readonly id: string
  /** Dotted permission code (`document.post`). */
  readonly code: string
  /** Arabic label rendered as the matrix row's primary text. */
  readonly nameAr: string
  readonly descriptionAr: string | null
  /** English description retained for diagnostics. */
  readonly description: string | null
  /**
   * Scopes this permission may be exercised at. A grant is only effective when
   * this overlaps the role's `allowedScopeTypes`, which is how the matrix explains
   * why a code cannot be selected for a given role.
   */
  readonly allowedScopeTypes: readonly RoleScopeType[]
}

/**
 * Role creation. `permissionCodes` is required: the server creates the role and
 * its grants as one atomic unit, so a role is never persisted with an empty or
 * half-applied grant set.
 */
export interface CreateRoleRequest {
  readonly name: string
  readonly nameAr: string
  readonly description?: string | null
  readonly permissionCodes: readonly string[]
  readonly allowedScopeTypes: readonly RoleScopeType[]
}

/**
 * Role metadata only. Deliberately separate from `ReplaceRolePermissionsRequest`:
 * each submits only the fields its operation owns.
 */
export interface UpdateRoleMetadataRequest {
  readonly name: string
  readonly nameAr: string
  readonly description?: string | null
  readonly expectedRowVersion: number
  readonly allowedScopeTypes: readonly RoleScopeType[]
}

/**
 * Wholesale permission replacement for a role. Replaces the complete set; it does
 * not merge, and it does not accept metadata fields.
 */
export interface ReplaceRolePermissionsRequest {
  readonly permissionCodes: readonly string[]
  readonly expectedRowVersion: number
}

/**
 * The user's sole role-and-scope assignment, exactly as the backend serves it.
 *
 * EIAMS v1 assigns every user exactly one role and one scope (D-SRS-01), so this
 * is a single projection and never a collection. The generated `UserRoleScope`
 * described a different record entirely (`role`, `scope`, `userId`,
 * `userRoleScopeId`), and the generated `paths` map published only the retired
 * plural route, so neither shape nor path is taken from it.
 *
 * `rowVersion` is the assignment's own version — it is NOT the user summary's
 * counter, and the two move independently.
 *
 * Backend source of truth:
 * `Application.UserRoleScopes.GetByUser.UserRoleScopeResponse`.
 */
export interface UserRoleScopeProjection {
  readonly id: string
  readonly roleId: string
  /** The role code (`WH_MGR`) as the server resolved it for this assignment. */
  readonly roleName: string
  readonly scopeType: RoleScopeType
  /** Null for an Enterprise assignment; the Site/Warehouse UUID otherwise. */
  readonly scopeId: string | null
  readonly rowVersion: number
}

/**
 * Atomic replacement of a user's sole assignment (D-SRS-01). Not a grant and not
 * a merge: the resulting user has exactly this one row.
 *
 * `expectedRowVersion` is required. A user with no assignment yet has current
 * version 0, so the first replacement submits 0; any other stale value is
 * refused with 409 `UserRoleScopes.RowVersionMismatch`.
 *
 * `scopeId` is null for Enterprise and required for Site and Warehouse.
 */
export interface ReplaceUserRoleScopeRequest {
  readonly roleId: string
  readonly scopeType: RoleScopeType
  readonly scopeId: string | null
  readonly expectedRowVersion: number
}
