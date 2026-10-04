import { PERMISSION_CODES } from '@/config/permissions'
import type { AppEnvironment } from '@/config/env'
import type { AuthTokenResponse } from '@/shared/types/generated/eiams-v1'

/**
 * Dev-only session fixture (transport boundary).
 *
 * The refresh endpoint is the single boundary where an authenticated session
 * enters the application: `SessionAdapter.refreshSession()` feeds the query
 * cache that guards (`RequireActiveScope`, `RouteAccessGuard`) read from.
 * Swapping that one request for a fixture — instead of touching guards — keeps
 * the production auth flow, 401-retry behavior, and RBAC wiring fully intact
 * while letting developers open any feature page without credentials.
 *
 * The fixture grants the complete PERMISSION_CODES vocabulary under one
 * selected Enterprise scope. To test a restricted account, trim
 * `permissionCodes` or scope the session to a Site/Warehouse scope.
 */

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_SCOPE_ID = '00000000-0000-0000-0000-000000000003'

/**
 * Whether the fixture session may answer `/auth/refresh`.
 *
 * The flag is opt-in and defaults to OFF (RESOLUTION-040). Defaulting it on
 * meant a developer could read a fixture-authenticated UI as proof that real
 * login, refresh, authorization and session hydration work, which is the exact
 * false evidence R-040 exists to prevent. `environment.authBypass` is already
 * validated and production-checked by `@/config/env`, so this stays a plain
 * read of the shared profile rather than a second, weaker source of truth.
 */
export function isDevAuthBypassEnabled(
  environment: Pick<AppEnvironment, 'mode' | 'authBypass'>,
): boolean {
  return environment.mode === 'development' && environment.authBypass
}

export function createDevSession(): AuthTokenResponse {
  return {
    accessToken: 'dev-access-token',
    expiresInSeconds: 3600,
    tokenType: 'Bearer',
    session: {
      user: {
        userId: DEV_USER_ID,
        username: 'dev',
        displayName: 'مطور النظام',
        status: 'Active',
        rowVersion: 0,
      },
      activeScope: {
        scopeId: DEV_SCOPE_ID,
        scopeType: 'Enterprise',
        displayName: 'نطاق التطوير',
      },
      permissionCodes: [...PERMISSION_CODES],
    },
  }
}
