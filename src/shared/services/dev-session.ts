import { PERMISSION_CODES } from '@/config/permissions'
import type { AppEnvironment } from '@/config/env'
import type { AuthTokenResponse } from '@/shared/types/generated/eiams-v1'

/**
 * Dev-only session fixture (transport boundary).
 *
 * The refresh endpoint is the single boundary where an authenticated session
 * enters the application: `SessionAdapter.refreshSession()` feeds the query
 * cache that guards (`RequireSelectedScope`, `RouteAccessGuard`) read from.
 * Swapping that one request for a fixture — instead of touching guards — keeps
 * the production auth flow, 401-retry behavior, and RBAC wiring fully intact
 * while letting developers open any feature page without credentials.
 *
 * The fixture grants the complete PERMISSION_CODES vocabulary under one
 * selected Enterprise scope. To test a restricted account, trim
 * `permissionCodes` or scope the session to a Site/Warehouse scope.
 */

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_ROLE_ID = '00000000-0000-0000-0000-000000000002'
const DEV_SCOPE_ID = '00000000-0000-0000-0000-000000000003'

/** Route to the real /auth/refresh endpoint unless explicitly disabled. */
export function isDevAuthBypassEnabled(
  environment: Pick<AppEnvironment, 'mode'>,
  rawEnv: Record<string, unknown>,
): boolean {
  return (
    environment.mode === 'development' && String(rawEnv['VITE_AUTH_BYPASS'] ?? 'true') !== 'false'
  )
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
      activeRoles: [{ roleId: DEV_ROLE_ID, code: 'sysadmin', nameAr: 'مدير النظام' }],
      availableScopes: [
        {
          scopeId: DEV_SCOPE_ID,
          scopeType: 'Enterprise',
          displayName: 'نطاق التطوير',
        },
      ],
      activeScope: {
        scopeId: DEV_SCOPE_ID,
        scopeType: 'Enterprise',
        displayName: 'نطاق التطوير',
      },
      scopeState: 'Selected',
      permissionCodes: [...PERMISSION_CODES],
    },
  }
}
