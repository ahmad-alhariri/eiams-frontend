import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type {
  AuthTokenResponse,
  LoginRequest,
  SessionResponse,
  SetActiveScopeOverrideRequest,
} from '@/modules/auth/types/auth.api-types'

const AUTH_LOGIN_PATH = '/auth/login'
const AUTH_LOGOUT_PATH = '/auth/logout'
const AUTH_SESSION_PATH = '/auth/session'
const AUTH_ACTIVE_SCOPE_PATH = '/auth/active-scope'

export interface AuthService {
  login: (request: LoginRequest) => Promise<AuthTokenResponse>
  getSession: () => Promise<SessionResponse>
  /**
   * Authorized admin override only (D-INT-01 § authorized administration
   * override: audited impersonation or debugging workflow). NOT an
   * ordinary-user scope switcher — no ordinary UI calls it. Always
   * returns the recomputed authoritative session.
   */
  setActiveScope: (request: SetActiveScopeOverrideRequest) => Promise<SessionResponse>
  logout: () => Promise<void>
}

/**
 * Creates the contract-only authentication service for one Axios boundary.
 *
 * The service deliberately does not install tokens, persist session data,
 * navigate, or normalize/present errors. Those concerns belong to the session
 * lifecycle, query, route, and UI boundaries that compose this service.
 */
export function createAuthService(client: AxiosInstance): AuthService {
  return {
    async login(request) {
      const response = await client.post<AuthTokenResponse>(AUTH_LOGIN_PATH, request)
      return response.data
    },
    async getSession() {
      const response = await client.get<SessionResponse>(AUTH_SESSION_PATH)
      return response.data
    },
    async setActiveScope(request) {
      const response = await client.put<SessionResponse>(AUTH_ACTIVE_SCOPE_PATH, request)
      return response.data
    },
    async logout() {
      await client.post(AUTH_LOGOUT_PATH)
    },
  }
}

export const authService = createAuthService(apiClient)
