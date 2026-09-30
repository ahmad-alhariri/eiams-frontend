import { describe, expect, it } from 'vitest'

import {
  createActiveScopeContext,
  selectedScope,
  toScopeCacheKey,
} from '@/modules/auth/services/active-scope-context'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import type { ScopeContext, SessionResponse } from '@/shared/types/generated/eiams-v1'

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

function sessionWithScope(activeScope: ScopeContext = warehouseScope): SessionResponse {
  return {
    user,
    permissionCodes: ['document.create'],
    activeScope,
    activeRoles: [],
  }
}

function sessionWithoutScope(): SessionResponse {
  return { user, permissionCodes: ['document.create'], activeRoles: [] }
}

function setupContext(session?: SessionResponse) {
  const queryClient = createQueryClient()
  if (session) {
    queryClient.setQueryData(authSessionQueryKey, session)
  }

  return { context: createActiveScopeContext(queryClient), queryClient }
}

describe('active scope context', () => {
  it('derives cache namespaces from the server-assigned scope projection', () => {
    expect(
      toScopeCacheKey({ scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة' }),
    ).toEqual({ kind: 'enterprise' })
    expect(toScopeCacheKey(siteScope)).toEqual({ kind: 'site', id: SITE_ID })
    expect(toScopeCacheKey(warehouseScope)).toEqual({ kind: 'warehouse', id: WAREHOUSE_ID })
  })

  it('rejects a Site or Warehouse scope that is missing its identifier', () => {
    expect(() => toScopeCacheKey({ ...siteScope, scopeId: null })).toThrow(TypeError)
  })

  it('exposes the server-assigned active scope and its cache key', () => {
    const { context } = setupContext(sessionWithScope())

    expect(context.getSession()).toEqual(sessionWithScope())
    expect(context.getActiveScope()).toEqual(warehouseScope)
    expect(context.getActiveScopeCacheKey()).toEqual({ kind: 'warehouse', id: WAREHOUSE_ID })
  })

  it('reports no scope when the session has not been hydrated yet', () => {
    const { context } = setupContext()

    expect(context.getSession()).toBeUndefined()
    expect(context.getActiveScope()).toBeUndefined()
    expect(context.getActiveScopeCacheKey()).toBeUndefined()
  })

  it('reports no scope for an authenticated session that carries none', () => {
    const { context } = setupContext(sessionWithoutScope())

    expect(context.getActiveScope()).toBeUndefined()
    expect(context.getActiveScopeCacheKey()).toBeUndefined()
  })

  it('reads the active scope directly, without a separate selection state', () => {
    expect(selectedScope(sessionWithScope(siteScope))).toEqual(siteScope)
    expect(selectedScope(undefined)).toBeUndefined()
  })

  it('exposes no scope-switching surface, so the scope cannot be mutated locally', () => {
    const { context } = setupContext(sessionWithScope())

    expect(Object.keys(context).sort()).toEqual([
      'getActiveScope',
      'getActiveScopeCacheKey',
      'getSession',
    ])
  })
})
