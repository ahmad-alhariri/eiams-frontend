/**
 * ONE login per USER per test file (coverage item 3): a per-file session cache
 * that logs each user in at most once for the file and re-installs that user's
 * access token on every call, so every test in the file reuses the same session
 * and no test triggers a second login for the same user.
 *
 * The cache is keyed BY USERNAME, not by file. A file that needs two different
 * users (for example a suspended account that must be rejected) must issue one
 * login per user, and must never be handed the previous user's cached
 * response - doing so silently turns a rejection into a success.
 *
 * The access token is installed through the app's REAL session adapter, so
 * every subsequent request goes out with the app's own Authorization-header
 * behaviour (including the 401-refresh-retry interceptor in api.client.ts).
 */
import { authService } from '@/modules/auth/services/auth.service'
import { sessionAdapter } from '@/shared/services/api.client'
import type { AuthTokenResponse } from '@/modules/auth/types/session.types'

/** Seeded credentials, documented in `docs/assets-custody/test-evidence.md:23`. */
export const CONTRACT_PASSWORD = 'Password123!' as const

export interface FileSession {
  /**
   * Logs `username` in ONCE per user for this file and returns the installed
   * token response. A later call for the SAME user reuses that user's cached
   * response; a call for a DIFFERENT user issues its own login.
   */
  login: (username: string) => Promise<AuthTokenResponse>
}

export function createFileSession(): FileSession {
  const cachedByUser = new Map<string, AuthTokenResponse>()
  return {
    async login(username) {
      const existing = cachedByUser.get(username)
      const response =
        existing ??
        // paced by the shared budget's request interceptor (url /auth/login)
        (await authService.login({ username, password: CONTRACT_PASSWORD }))
      cachedByUser.set(username, response)
      sessionAdapter.installTokenResponse(response)
      return response
    },
  }
}
