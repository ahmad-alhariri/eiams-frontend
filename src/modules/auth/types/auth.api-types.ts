/**
 * Handwritten singular-session contract (D-SRS-01, D-INT-01 § session model).
 *
 * The authenticated session carries exactly one required `activeScope` —
 * the user's sole persistent `UserRoleScope` — with `scopeState` of
 * `Selected` or `Unavailable` only. There is no `availableScopes`
 * collection and no `SelectionRequired` state.
 *
 * `Unavailable` is reserved for a server-detected inactive, expired, or
 * otherwise invalid sole assignment. The server returns no usable
 * permissions in that state and the frontend blocks feature access with
 * the established Arabic contact-administrator experience.
 *
 * D-INT-02 handwritten per-module wire contract: this file is the
 * frontend-owned session shape. It deliberately does not import the
 * deprecated generated OpenAPI artifact, which still declares the
 * superseded multi-scope session. Do NOT re-add `availableScopes` or
 * `SelectionRequired` here. Wave-1 owns the broader ApiTransport
 * migration; this module keeps its Axios boundary (see auth.service).
 */

/** The three scope kinds of the single persistent assignment. */
export type ScopeType = 'Enterprise' | 'Site' | 'Warehouse'

/** The sole server-selected working context of the session. */
export interface ScopeContext {
  scopeType: ScopeType
  scopeId: string | null
  displayName: string
  siteId?: string
  warehouseId?: string
}

/** Minimal signed-in user projection carried by the session. */
export interface SessionUser {
  userId: string
  username: string
  displayName: string
}

/** Server-calculated effective role for the required `activeScope`. */
export interface EffectiveRole {
  roleId: string
  code?: string
  nameAr?: string
}

/** Only two session states are valid; `SelectionRequired` does not exist. */
export type ScopeState = 'Selected' | 'Unavailable'

/** Authoritative singular session projection. */
export interface SessionResponse {
  user: SessionUser
  /** Required: identifies the sole assigned context even when Unavailable. */
  activeScope: ScopeContext
  scopeState: ScopeState
  activeRoles: readonly EffectiveRole[]
  permissionCodes: readonly string[]
}

/** Login credential payload (`username`, never email, per D-INT-01). */
export interface LoginRequest {
  username: string
  password: string
}

/** Token response handed straight to the adapter-owned session store. */
export interface AuthTokenResponse {
  accessToken: string
  expiresInSeconds: number
  tokenType: 'Bearer'
  session: SessionResponse
}

/**
 * Authorized admin override payload for `PUT /auth/active-scope`
 * (D-INT-01 § authorized administration override: audited impersonation
 * or debugging workflow only).
 *
 * This is NOT an ordinary-user scope switcher: no ordinary UI calls it,
 * it persists no additional assignment, and the endpoint always returns
 * the recomputed authoritative session. The zod schema in
 * `schemas/auth.schemas.ts` validates the same invariant
 * (only Enterprise may use a null identifier).
 */
export interface SetActiveScopeOverrideRequest {
  scopeType: ScopeType
  scopeId: string | null
}
