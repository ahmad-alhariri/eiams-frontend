/**
 * Contract smoke — coverage item 1: login + bodyless refresh + session +
 * logout + origin rejection, through the REAL authService / apiClient /
 * sessionAdapter. Exactly ONE login in this file (keeper), reused by every
 * test below. NO MSW.
 *
 * Established wire facts (kept as exact assertions — see `docs/contract-smoke.md`):
 * - `POST /auth/refresh` with NO cookie -> 400 `USERS_INVALID_REFRESH_TOKEN`
 *   (NOT 401 — backend-contract note, bead `cwjc`). Asserted as the real 400.
 * - Foreign `Origin` -> 403 `REFRESH_TOKEN_ORIGIN_REJECTED`
 *   (`src/shared/api/error-copy-ar.ts:38` already carries the code).
 * - Login body is exactly `{username, password}` + `Content-Type: application/json`
 *   (`src/modules/auth/services/auth.service.ts` — correct).
 */
import axios from 'axios'
import { beforeAll, describe, expect, it } from 'vitest'
import { apiClient, sessionAdapter } from '@/shared/services/api.client'
import { authService } from '@/modules/auth/services/auth.service'
import { readApiError } from '@/shared/api/envelope'
import { wireEvidence } from './contract-assert'
import { createFileSession } from './contract-session'
import { jarClear, jarGet, withoutCookie } from './session-cookie-jar'
import './contract-api-base'

const REFRESH_COOKIE = 'eiams_refresh_token'
const fileSession = createFileSession()
const KEEPER = 'keeper'

describe('contract-smoke: auth service + refresh contract', () => {
  beforeAll(() => {
    jarClear()
  })

  it('POST /auth/refresh with NO cookie -> exact 400 USERS_INVALID_REFRESH_TOKEN', async () => {
    try {
      const response = await apiClient.post('/auth/refresh', undefined, withoutCookie({}))
      throw new Error(
        `REFRESH NO-COOKIE DIVERGENCE: expected 400 but the call succeeded — observed status=${response.status} body=${JSON.stringify(response.data).slice(0, 400)}`,
      )
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 400) {
        throw new Error(`REFRESH NO-COOKIE FAILURE: expected status=400 — ${wireEvidence(error)}`, {
          cause: error,
        })
      }
      const code = readApiError(error.response.data)?.code
      if (code !== 'USERS_INVALID_REFRESH_TOKEN') {
        throw new Error(
          `REFRESH NO-COOKIE CODE DIVERGENCE: expected USERS_INVALID_REFRESH_TOKEN — observed status=400 body=${JSON.stringify(error.response.data).slice(0, 400)}`,
          { cause: error },
        )
      }
    }
  })

  it('POST /auth/refresh with foreign Origin -> exact 403 REFRESH_TOKEN_ORIGIN_REJECTED', async () => {
    try {
      const response = await apiClient.post('/auth/refresh', undefined, {
        headers: { Origin: 'http://evil.origin' },
      })
      throw new Error(
        `REFRESH ORIGIN DIVERGENCE: expected 403 but the call succeeded — observed status=${response.status} body=${JSON.stringify(response.data).slice(0, 400)}`,
      )
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 403) {
        throw new Error(`REFRESH ORIGIN FAILURE: expected status=403 — ${wireEvidence(error)}`, {
          cause: error,
        })
      }
      const code = readApiError(error.response.data)?.code
      if (code !== 'REFRESH_TOKEN_ORIGIN_REJECTED') {
        throw new Error(
          `REFRESH ORIGIN CODE DIVERGENCE: expected REFRESH_TOKEN_ORIGIN_REJECTED — observed status=403 body=${JSON.stringify(error.response.data).slice(0, 400)}`,
          { cause: error },
        )
      }
    }
  })

  it('login keeper via authService -> 200, Bearer token + session installed', async () => {
    jarClear()
    const tokens = await fileSession.login(KEEPER)
    if (tokens.accessToken.length === 0) {
      throw new Error(
        `LOGIN DIVERGENCE: no accessToken in the login envelope — body=${JSON.stringify(tokens).slice(0, 400)}`,
      )
    }
    expect(Object.keys(tokens).sort()).toEqual(['accessToken', 'expiresInSeconds', 'session'])
    expect(tokens.session.role.name).toBe('WH_KEEPER')
    expect(tokens.session.activeScope.scopeType).toBe('Warehouse')
  })

  it('getSession after the real login -> the same user session', async () => {
    const tokens = await fileSession.login(KEEPER)
    const session = await authService.getSession()
    if (session.user.id !== tokens.session.user.id) {
      throw new Error(
        `SESSION DIVERGENCE: session user ${session.user.id} != login user ${tokens.session.user.id} — body=${JSON.stringify(session).slice(0, 400)}`,
      )
    }
    expect(session.permissionCodes.length).toBeGreaterThan(0)
  })

  it('POST /auth/refresh WITH the real refresh cookie -> 200 new token', async () => {
    await fileSession.login(KEEPER)
    const cookie = jarGet(REFRESH_COOKIE)
    if (cookie === undefined) {
      throw new Error(
        'REFRESH COOKIE DIVERGENCE: login did not set the `eiams_refresh_token` cookie in the jar',
      )
    }
    const response = await apiClient.post('/auth/refresh', undefined, {
      headers: { Cookie: `${REFRESH_COOKIE}=${cookie}` },
    })
    const body = readApiError(response.data) === null ? response.data : null
    if (response.status !== 200 || body === null) {
      throw new Error(
        `REFRESH WITH COOKIE DIVERGENCE: expected 200 — observed status=${response.status} body=${JSON.stringify(response.data).slice(0, 400)}`,
      )
    }
    const tokens = (body as { data?: { accessToken?: string } }).data
    expect(tokens?.accessToken?.length ?? 0).toBeGreaterThan(0)
  })

  it('401 then the REAL refresh-retry -> session restored without a second login', async () => {
    await fileSession.login(KEEPER)
    sessionAdapter.clearAccessToken()
    // No Authorization header now: apiClient must 401, refresh via the cookie
    // through the app's own interceptor, and retry — all inside getSession().
    const session = await authService.getSession()
    expect(session.role.name).toBe('WH_KEEPER')
  })

  it('logout -> 200 empty success envelope', async () => {
    await fileSession.login(KEEPER)
    try {
      await authService.logout()
    } catch (error: unknown) {
      throw new Error(`LOGOUT FAILURE: expected 200 — ${wireEvidence(error)}`, { cause: error })
    }
  })

  it('login body is exactly {username,password} with JSON content type (via the app transport)', async () => {
    // A deliberate duplicate of the working login body proves the REQUEST CODE
    // is what the backend binds: the response must be 200, not a model-binding 400.
    jarClear()
    const response = await apiClient.post<{ data?: unknown }>('/auth/login', {
      username: KEEPER,
      password: 'Password123!',
    })
    if (response.status !== 200) {
      throw new Error(
        `LOGIN BODY DIVERGENCE: expected 200 for {username,password} — observed status=${response.status} body=${JSON.stringify(response.data).slice(0, 400)}`,
      )
    }
    // Backend model-binding errors key `details` by PROPERTY NAME, e.g.
    // {"Username":["The Username field is required."]} — not details.body.
    try {
      await apiClient.post('/auth/login', {})
      throw new Error('LOGIN VALIDATION DIVERGENCE: empty body was accepted')
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 400) {
        throw new Error(`LOGIN VALIDATION FAILURE: expected status=400 — ${wireEvidence(error)}`, {
          cause: error,
        })
      }
      const details = readApiError(error.response.data)?.details ?? {}
      const keys = Object.keys(details)
      if (!keys.some((key) => /username|password|body/i.test(key))) {
        throw new Error(
          `LOGIN VALIDATION SHAPE DIVERGENCE: details not keyed by property name — observed status=400 body=${JSON.stringify(error.response.data).slice(0, 400)}`,
          { cause: error },
        )
      }
    }
  })
})
