/**
 * Admin module API types — handwritten contracts for direct backend integration.
 *
 * Authority: D-SRS-01 (single role + single scope per user, see
 * `docs/single-role-single-scope-assignment-decision.md`) and D-INT-02 /
 * ADR-0001 (handwritten per-module wire contracts via the shared
 * `ApiTransport`; no imports from `@/shared/types/generated/eiams-v1`).
 *
 * DEVIATION NOTE: the task text for eiams-frontend-7ipk.2 says to "map
 * directly to the generated singular backend request". That generation
 * strategy is superseded by D-INT-02 (accepted): this module defines its own
 * handwritten wire types here instead of importing generated request types.
 * The singular replacement target is `PUT /api/v1/admin/users/{userId}/role-scope`
 * (singular path). The legacy plural path `/admin/users/{userId}/role-scopes`
 * in `admin.service.ts` is NOT migrated here — that belongs to task .3.
 *
 * Wire names below (roleId, scopeType, scopeId, nameAr, displayName) match the
 * backend's actual JSON serialization.
 */

/** Matches backend Uuid: string (GUID). */
export type Uuid = string

/** Backend ScopeType enum: Enterprise (global) | Site | Warehouse. */
export type ScopeType = 'Enterprise' | 'Site' | 'Warehouse'

/** Backend role reference projection: { roleId: Uuid, nameAr: string }. */
export interface RoleRef {
  readonly roleId: Uuid
  readonly nameAr: string
}

/** Backend scope reference projection. Enterprise carries a null scopeId. */
export interface ScopeRef {
  readonly scopeType: ScopeType
  readonly scopeId: Uuid | null
  readonly displayName: string
}

/** Singular read projection of a user's role-scope assignment. */
export interface UserRoleScope {
  readonly role: RoleRef
  readonly scope: ScopeRef
}

/**
 * Singular replacement request body for
 * `PUT /api/v1/admin/users/{userId}/role-scope`.
 * Exactly one assignment: Enterprise requires scopeId null, Site/Warehouse
 * require a scope UUID. No rowVersion — optimistic concurrency is
 * unsupported for this endpoint per acceptance.
 */
export interface ReplaceRoleScopeRequest {
  readonly roleId: Uuid
  readonly scopeType: ScopeType
  readonly scopeId: Uuid | null
}

/** Singular replacement response: the stored assignment projection. */
export type ReplaceRoleScopeResponse = UserRoleScope
