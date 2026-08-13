import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { normalizeApiError } from '@/shared/services/api-error'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'
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
  availableScopes: [
    {
      scopeType: 'Warehouse',
      scopeId: '20000000-0000-4000-8000-000000000001',
      warehouseId: '20000000-0000-4000-8000-000000000001',
      siteId: '30000000-0000-4000-8000-000000000001',
      displayName: 'المستودع المركزي',
    },
  ],
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    warehouseId: '20000000-0000-4000-8000-000000000001',
    siteId: '30000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  },
  scopeState: 'Selected',
  activeRoles: [
    {
      roleId: '40000000-0000-4000-8000-000000000001',
      code: 'WH_KEEPER',
      nameAr: 'أمين مستودع',
    },
  ],
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
  return createAuthService(bundle.client)
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
        return HttpResponse.json(tokenResponse)
      }),
    )

    await expect(service.login(request)).resolves.toEqual(tokenResponse)
    expect(received).toEqual(request)
    expect(authorization).toBeNull()
    expect(credentials).toBe('include')
  })

  it('retrieves the server-owned session and replaces the active scope through typed endpoints', async () => {
    const service = setupService()
    const selectedScope = {
      scopeType: 'Warehouse' as const,
      scopeId: '20000000-0000-4000-8000-000000000001',
    }
    let scopeRequest: unknown = null

    server.use(
      http.get(`${API_BASE_URL}/auth/session`, () => HttpResponse.json(sessionFixture)),
      http.put(`${API_BASE_URL}/auth/active-scope`, async ({ request }) => {
        scopeRequest = await request.json()
        return HttpResponse.json(sessionFixture)
      }),
    )

    await expect(service.getSession()).resolves.toEqual(sessionFixture)
    await expect(service.setActiveScope(selectedScope)).resolves.toEqual(sessionFixture)
    expect(scopeRequest).toEqual(selectedScope)
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

    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json(
          {
            status: 401,
            code: 'auth.invalid_credentials',
            titleAr: 'بيانات تسجيل الدخول غير صحيحة.',
            traceId: 'login-failed',
          },
          { status: 401 },
        ),
      ),
    )

    const error = await service
      .login({ username: 'warehouse.keeper', password: 'wrong-password' })
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 401,
      code: 'auth.invalid_credentials',
      titleAr: 'بيانات تسجيل الدخول غير صحيحة.',
    })
  })
})
