import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { LoginRequest, paths } from '@/shared/types/generated/eiams-v1'
import type { AuthTokenResponse, SessionResponse } from '@/modules/auth/types/session.types'

const AUTH_LOGIN_PATH = '/auth/login' satisfies keyof paths
const AUTH_LOGOUT_PATH = '/auth/logout' satisfies keyof paths
const AUTH_SESSION_PATH = '/auth/session' satisfies keyof paths

export interface AuthService {
  login: (request: LoginRequest) => Promise<AuthTokenResponse>
  getSession: () => Promise<SessionResponse>
  logout: () => Promise<void>
}

/**
 * Creates the contract-only authentication service for one Axios boundary.
 *
 * The service deliberately does not install tokens, persist session data,
 * navigate, or normalize/present errors. Those concerns belong to the session
 * lifecycle, query, route, and UI boundaries that compose this service.
 */
export function createAuthService(transport: ApiTransport): AuthService {
  return {
    async login(request) {
      const response = await transport.request<AuthTokenResponse>({
        path: AUTH_LOGIN_PATH,
        method: 'POST',
        body: request,
      })
      return response
    },
    async getSession() {
      const response = await transport.request<SessionResponse>({
        path: AUTH_SESSION_PATH,
        method: 'GET',
      })
      return response
    },
    async logout() {
      // 204: no body, so `requestEmpty` rather than `request`.
      await transport.requestEmpty({ path: AUTH_LOGOUT_PATH, method: 'POST' })
    },
  }
}

export const authService = createAuthService(apiTransport)
