import axios from 'axios'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { normalizeApiError } from '@/shared/services/api-error'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'
import { errJson, okJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

const sessionFixture: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.keeper',
    displayName: 'أمين المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['document.create'],
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    warehouseId: '20000000-0000-4000-8000-000000000001',
    siteId: '30000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  },
}

const tokenResponse: AuthTokenResponse = {
  accessToken: 'in-memory-token',
  expiresInSeconds: 300,
  session: sessionFixture,
  tokenType: 'Bearer',
}

const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAuthService(createAxiosTransport(bundle.client))
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('AuthService', () => {
  it('sends the contract login payload unchanged and returns its token/session response', async () => {
    const service = setupService()
    const request = { username: ' warehouse.keeper ', password: ' password ' }
    let received: unknown = null
    let authorization: string | null = null
    let credentials: RequestCredentials | null = null

    server.use(
      http.post(`${API_BASE_URL}/auth/login`, async ({ request: httpRequest }) => {
        received = await httpRequest.json()
        authorization = httpRequest.headers.get('Authorization')
        credentials = httpRequest.credentials
        return okJson(tokenResponse)
      }),
    )

    await expect(service.login(request)).resolves.toEqual(tokenResponse)
    expect(received).toEqual(request)
    expect(authorization).toBeNull()
    expect(credentials).toBe('include')
  })

  it('retrieves the server-owned session without offering a scope mutation', async () => {
    const service = setupService()

    server.use(http.get(`${API_BASE_URL}/auth/session`, () => okJson(sessionFixture)))

    await expect(service.getSession()).resolves.toEqual(sessionFixture)
  })

  it('performs idempotent logout without inventing a response body', async () => {
    const service = setupService()
    let logoutCalls = 0

    server.use(
      http.post(`${API_BASE_URL}/auth/logout`, () => {
        logoutCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(service.logout()).resolves.toBeUndefined()
    expect(logoutCalls).toBe(1)
  })

  it('keeps Axios errors available to the shared Arabic error normalizer', async () => {
    const service = setupService()

    // The real login failure is a neutral 404 USERS_NOT_FOUND nested inside the
    // standard error envelope; Arabic copy is resolved from the governed table
    // by code, never taken from the wire.
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        errJson(404, { code: 'USERS_NOT_FOUND', message: 'User not found.' }),
      ),
    )

    const error = await service
      .login({ username: 'warehouse.keeper', password: 'wrong-password' })
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 404,
      code: 'USERS_NOT_FOUND',
      titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    })
  })
})
