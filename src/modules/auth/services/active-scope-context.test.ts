import { describe, expect, it } from 'vitest'

import {
  createActiveScopeContext,
  selectedScope,
  toScopeCacheKey,
} from '@/modules/auth/services/active-scope-context'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import type { SessionResponse, SessionScope } from '@/modules/auth/types/session.types'

const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001'
const SITE_ID = '30000000-0000-4000-8000-000000000001'

const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'warehouse.keeper@eiams.local',
  firstName: 'أمين',
  lastName: 'المستودع',
  employeeId: null,
  employeeName: null,
}

const role = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'WarehouseKeeper',
  nameAr: 'أمين مستودع',
  description: null,
}

const warehouseScope = {
  scopeType: 'Warehouse' as const,
  scopeId: WAREHOUSE_ID,
  scopeName: 'مستودع دمشق المركزي',
}

const siteScope = {
  scopeType: 'Site' as const,
  scopeId: SITE_ID,
  scopeName: 'موقع دمشق',
}

function sessionWithScope(activeScope: SessionScope = warehouseScope): SessionResponse {
  return {
    user,
    role,
    permissionCodes: ['document.create'],
    activeScope,
  }
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
      toScopeCacheKey({ scopeType: 'Enterprise', scopeId: null, scopeName: 'الهيئة' }),
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

  it('reports no scope only when no session is cached', () => {
    const { context } = setupContext()

    expect(context.getActiveScope()).toBeUndefined()
    expect(context.getActiveScopeCacheKey()).toBeUndefined()
  })

  // There is deliberately no "authenticated session carrying no scope" case. The wire
  // contract makes `activeScope` required, so that state is unrepresentable in the type.
  // It previously had to be handled here, and handling it was what allowed the route
  // guard to read an absent scope as a satisfied one.

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
