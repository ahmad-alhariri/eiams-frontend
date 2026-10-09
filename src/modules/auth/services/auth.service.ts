import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type {
  AuthTokenResponse,
  LoginRequest,
  SessionResponse,
} from '@/modules/auth/types/session.types'

/**
 * The three auth paths, declared locally rather than checked against
 * `keyof paths` from `shared/types/generated/eiams-v1`.
 *
 * The generated path table is frozen migration scaffolding that `whhu.5` deletes
 * outright. `satisfies keyof paths` therefore guarded these constants against a
 * document that is meant to disappear: the check's passing meant nothing about the
 * live contract, and restoring it would drag a deleted dependency back in. The real
 * guard on a path is an integration test that exercises the endpoint, which is what
 * `auth.service.test.ts` does.
 */
const AUTH_LOGIN_PATH = '/auth/login'
const AUTH_LOGOUT_PATH = '/auth/logout'
const AUTH_SESSION_PATH = '/auth/session'

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
      // 200 with a success envelope whose `data` is empty — not a 204 with no body.
      // `requestEmpty` still applies because it never reads the payload; it returns
      // no value to the caller, and the logout contract has nothing to return.
      await transport.requestEmpty({ path: AUTH_LOGOUT_PATH, method: 'POST' })
    },
  }
}

export const authService = createAuthService(apiTransport)
