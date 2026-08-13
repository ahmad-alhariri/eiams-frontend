import { describe, expect, it } from 'vitest'

import {
  createAuthTokenResponse,
  createInventoryBalance,
  createMaterial,
  createPage,
  createProblemDetails,
  createScopeContext,
  createSession,
  createWarehouse,
  fixtureUuid,
} from '@/test/msw/factories'

describe('contract-derived MSW factories', () => {
  it('creates valid, deterministic UUIDs for fixture identifiers', () => {
    expect(fixtureUuid()).toBe('00000000-0000-4000-8000-000000000001')
    expect(fixtureUuid(16)).toBe('00000000-0000-4000-8000-000000000010')
  })

  it('composes a selected session into the token response and permits typed overrides', () => {
    const scope = createScopeContext({
      scopeType: 'Enterprise',
      scopeId: null,
      displayName: 'الهيئة',
    })
    const session = createSession({
      activeScope: scope,
      availableScopes: [scope],
      permissionCodes: ['audit.view'],
    })
    const response = createAuthTokenResponse({ expiresInSeconds: 60, session })

    expect(response).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 60 })
    expect(response.session.activeScope).toEqual(scope)
    expect(response.session.permissionCodes).toEqual(['audit.view'])
  })

  it('uses the shared v1 paging envelope and derives its totals from items', () => {
    const page = createPage([createWarehouse(), createWarehouse({ warehouseId: fixtureUuid(32) })])

    expect(page.meta).toMatchObject({ pageIndex: 1, pageSize: 20, totalItems: 2, totalPages: 1 })
    expect(page.items).toHaveLength(2)
  })

  it('returns contract-shaped operational entities and problem details', () => {
    const material = createMaterial({ materialKind: 'Asset', requiresAssetNumber: true })
    const balance = createInventoryBalance({
      material: { id: material.materialId, displayName: material.nameAr },
    })
    const problem = createProblemDetails({ status: 409, code: 'conflict.version' })

    expect(balance.material.id).toBe(material.materialId)
    expect(material.requiresAssetNumber).toBe(true)
    expect(problem).toMatchObject({ status: 409, code: 'conflict.version' })
  })
})
