/**
 * Compatibility shim: the canonical session response types now live in
 * `@/shared/auth/session.types` so `shared` services can use them without importing
 * `modules/auth` (which would invert the shared -> modules dependency). This file
 * re-exports them (type-only) so every existing `@/modules/auth/types/session.types`
 * importer keeps working unchanged.
 *
 * `LoginRequest` is not re-exported from `shared`: only the auth service sends it,
 * so its handwritten declaration stays here, next to the service that binds it.
 */
export type {
  AuthTokenResponse,
  SessionResponse,
  SessionRole,
  SessionScope,
  SessionScopeType,
  SessionUser,
} from '@/shared/auth/session.types'

/**
 * The `POST /auth/login` body. Exactly the two credential fields the backend binds; the
 * refresh credential is a host-only cookie and is never part of a client request body.
 */
export interface LoginRequest {
  readonly username: string
  readonly password: string
}
