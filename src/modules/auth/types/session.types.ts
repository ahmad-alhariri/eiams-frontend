/**
 * Handwritten session contract, aligned field-for-field with the backend's
 * `Application.Users.GetSession.UserSessionResponse` (D-SRS-01).
 *
 * This deliberately does NOT come from `shared/types/generated/eiams-v1`. That document
 * was generated from an OpenAPI snapshot that predates the singular session projection,
 * so its `SessionResponse` had no `role` at all and its `ScopeContext` named the scope's
 * label `displayName` while the server sends `scopeName`. Reading through it produced
 * `undefined` in Arabic-facing chrome.
 *
 * Two properties of this shape are load-bearing and must not be relaxed:
 *
 * - `role` is SINGULAR. The user holds exactly one role; the plural `activeRoles[]` from
 *   the old snapshot never existed on the wire.
 * - `activeScope` is REQUIRED. The server assigns the scope and always sends one, so a
 *   session without it is not a valid session. Modelling it as optional is what previously
 *   let the route guard treat "scope unknown" as "scope satisfied".
 */

/** The scope levels a session can be evaluated in. Mirrors `UserAssignmentScopeType`. */
export type SessionScopeType = 'Enterprise' | 'Site' | 'Warehouse'

/** The signed-in user, as projected for the session. */
export interface SessionUser {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly employeeId: string | null
  readonly employeeName: string | null
}

/**
 * The user's single role. `nameAr` is the authoritative Arabic label and is what the UI
 * must render; `name` is the English/code name.
 */
export interface SessionRole {
  readonly id: string
  readonly name: string
  readonly nameAr: string
  readonly description: string | null
}

/**
 * The server-assigned active scope. `scopeName` is the Arabic label shown in the sidebar
 * and header. `scopeId` is null only for the Enterprise scope.
 */
export interface SessionScope {
  readonly scopeType: SessionScopeType
  readonly scopeId: string | null
  readonly scopeName: string
}

/** The authoritative session projection. Nothing else about the session is trusted. */
export interface SessionResponse {
  readonly user: SessionUser
  readonly role: SessionRole
  readonly activeScope: SessionScope
  readonly permissionCodes: readonly string[]
}

/** The login response: the token envelope plus the session it grants. */
export interface AuthTokenResponse {
  readonly accessToken: string
  readonly expiresInSeconds: number
  readonly tokenType: 'Bearer'
  readonly session: SessionResponse
}
