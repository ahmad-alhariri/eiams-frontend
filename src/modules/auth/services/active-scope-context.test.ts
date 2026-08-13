import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createActiveScopeContext,
  selectedScope,
  toScopeCacheKey,
} from '@/modules/auth/services/active-scope-context'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import type { ScopeContext, SessionResponse } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001'
const SITE_ID = '30000000-0000-4000-8000-000000000001'

const user = {
  userId: '10000000-0000-4000-8000-000000000001',
  username: 'warehouse.keeper',
  displayName: 'أمين المستودع',
  status: 'Active' as const,
  rowVersion: 1,
}

const warehouseScope = {
  scopeType: 'Warehouse' as const,
  scopeId: WAREHOUSE_ID,
  displayName: 'مستودع دمشق المركزي',
  siteId: SITE_ID,
  warehouseId: WAREHOUSE_ID,
}

const siteScope = {
  scopeType: 'Site' as const,
  scopeId: SITE_ID,
  displayName: 'موقع دمشق',
  siteId: SITE_ID,
}

function selectedSession(activeScope: ScopeContext = warehouseScope): SessionResponse {
  return {
    user,
    permissionCodes: ['document.create'],
    availableScopes: [warehouseScope, siteScope],
    activeScope,
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const bundles: ApiClientBundle[] = []

function setupContext() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  const queryClient = createQueryClient()
  const context = createActiveScopeContext({
    authService: createAuthService(bundle.client),
    queryClient,
  })

  return { context, queryClient }
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('active scope context', () => {
  it('derives cache namespaces only from the selected server projection', () => {
    expect(
      toScopeCacheKey({ scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة' }),
    ).toEqual({ kind: 'enterprise' })
    expect(toScopeCacheKey(siteScope)).toEqual({ kind: 'site', id: SITE_ID })
    expect(toScopeCacheKey(warehouseScope)).toEqual({ kind: 'warehouse', id: WAREHOUSE_ID })
    expect(selectedScope({ ...selectedSession(), scopeState: 'SelectionRequired' })).toBeUndefined()
  })

  it('serializes scope switches, evicts prior scoped data, and caches the final server session', async () => {
    const { context, queryClient } = setupContext()
    const calls: unknown[] = []
    const warehouseSession = selectedSession(warehouseScope)
    const siteSession = selectedSession(siteScope)

    server.use(
      http.put(`${API_BASE_URL}/auth/active-scope`, async ({ request }) => {
        calls.push(await request.json())
        return HttpResponse.json(calls.length === 1 ? siteSession : warehouseSession)
      }),
    )

    queryClient.setQueryData(authSessionQueryKey, selectedSession())
    queryClient.setQueryData(
      queryKeys.scoped({ kind: 'warehouse', id: WAREHOUSE_ID }, 'balances'),
      [1],
    )
    queryClient.setQueryData(queryKeys.scoped({ kind: 'site', id: SITE_ID }, 'documents'), [2])
    queryClient.setQueryData(queryKeys.public('catalog'), ['retained'])

    const siteSwitch = context.switchScope({ scopeType: 'Site', scopeId: SITE_ID })
    const warehouseSwitch = context.switchScope({ scopeType: 'Warehouse', scopeId: WAREHOUSE_ID })

    await expect(siteSwitch).resolves.toEqual(siteSession)
    await expect(warehouseSwitch).resolves.toEqual(warehouseSession)
    expect(calls).toEqual([
      { scopeType: 'Site', scopeId: SITE_ID },
      { scopeType: 'Warehouse', scopeId: WAREHOUSE_ID },
    ])
    expect(context.getActiveScopeCacheKey()).toEqual({ kind: 'warehouse', id: WAREHOUSE_ID })
    expect(queryClient.getQueryData(authSessionQueryKey)).toEqual(warehouseSession)
    expect(
      queryClient.getQueryData(
        queryKeys.scoped({ kind: 'warehouse', id: WAREHOUSE_ID }, 'balances'),
      ),
    ).toBeUndefined()
    expect(
      queryClient.getQueryData(queryKeys.scoped({ kind: 'site', id: SITE_ID }, 'documents')),
    ).toBeUndefined()
    expect(queryClient.getQueryData(queryKeys.public('catalog'))).toEqual(['retained'])
  })

  it('preserves the prior session on an ordinary rejected switch', async () => {
    const { context, queryClient } = setupContext()
    const previousSession = selectedSession()

    server.use(
      http.put(`${API_BASE_URL}/auth/active-scope`, () =>
        HttpResponse.json({ code: 'validation.scope', status: 422 }, { status: 422 }),
      ),
    )

    queryClient.setQueryData(authSessionQueryKey, previousSession)
    queryClient.setQueryData(
      queryKeys.scoped({ kind: 'warehouse', id: WAREHOUSE_ID }, 'balances'),
      [1],
    )

    await expect(context.switchScope({ scopeType: 'Site', scopeId: SITE_ID })).rejects.toBeTruthy()
    expect(queryClient.getQueryData(authSessionQueryKey)).toEqual(previousSession)
    expect(
      queryClient.getQueryData(
        queryKeys.scoped({ kind: 'warehouse', id: WAREHOUSE_ID }, 'balances'),
      ),
    ).toEqual([1])
  })

  it('refetches the session when the server reports that a scope was revoked', async () => {
    const { context, queryClient } = setupContext()
    const previousSession = selectedSession()
    const unavailableSession: SessionResponse = {
      user: previousSession.user,
      availableScopes: [],
      permissionCodes: [],
      scopeState: 'Unavailable',
      activeRoles: previousSession.activeRoles,
    }
    let sessionRequests = 0

    server.use(
      http.put(`${API_BASE_URL}/auth/active-scope`, () =>
        HttpResponse.json(
          {
            code: 'auth.scope_not_available',
            titleAr: 'النطاق المحدد غير متاح لك.',
            status: 403,
            traceId: 'trace-1',
          },
          { status: 403 },
        ),
      ),
      http.get(`${API_BASE_URL}/auth/session`, () => {
        sessionRequests += 1
        return HttpResponse.json(unavailableSession)
      }),
    )

    queryClient.setQueryData(authSessionQueryKey, previousSession)

    await expect(context.switchScope({ scopeType: 'Site', scopeId: SITE_ID })).rejects.toBeTruthy()
    expect(sessionRequests).toBe(1)
    expect(queryClient.getQueryData(authSessionQueryKey)).toEqual(unavailableSession)
  })
})
