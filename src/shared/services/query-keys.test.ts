import { describe, expect, it } from 'vitest'
import { createQueryClient } from '@/shared/services/query.client'
import {
  clearProtectedQueries,
  clearScopedQueries,
  invalidateResourceInstance,
  invalidateResourceLists,
  invalidateResourceTree,
  invalidateScopedQueries,
  queryKeys,
  removeProtectedQueries,
  removeScopedQueries,
  type ScopeCacheKey,
} from '@/shared/services/query-keys'

describe('query-key conventions', () => {
  it('keeps public and scoped data in distinct deterministic namespaces', () => {
    expect(queryKeys.public('catalog', 'materials')).toEqual(['public', 'catalog', 'materials'])
    expect(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances')).toEqual([
      'scoped',
      'warehouse',
      'wh-1',
      'balances',
    ])
    expect(queryKeys.scopeOnly({ kind: 'site', id: 'site-1' })).toEqual([
      'scoped',
      'site',
      'site-1',
    ])
  })

  it('builds deterministic keys from scope, resource, and variable parts', () => {
    const scope: ScopeCacheKey = { kind: 'warehouse', id: 'wh-1' }
    const filters = { page: 1, pageSize: 25 }

    expect(queryKeys.scoped(scope, 'inventory', 'balances', filters)).toEqual([
      'scoped',
      'warehouse',
      'wh-1',
      'inventory',
      'balances',
      filters,
    ])
  })

  it('invalidates one scope and removes all protected scoped data', async () => {
    const client = createQueryClient()
    const site = { kind: 'site', id: 'site-1' } as const
    client.setQueryData(queryKeys.scoped(site, 'documents'), ['site document'])
    client.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'documents'), [
      'warehouse document',
    ])
    client.setQueryData(queryKeys.public('catalog'), ['material'])

    await invalidateScopedQueries(client, site)
    expect(client.getQueryState(queryKeys.scoped(site, 'documents'))?.isInvalidated).toBe(true)
    expect(
      client.getQueryState(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'documents'))?.isInvalidated,
    ).toBe(false)

    removeScopedQueries(client)
    expect(client.getQueryData(queryKeys.scoped(site, 'documents'))).toBeUndefined()
    expect(client.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })

  it('cancels and removes every scoped query while retaining public data', async () => {
    const client = createQueryClient()
    client.setQueryData(queryKeys.scoped({ kind: 'site', id: 'site-1' }, 'documents'), ['draft'])
    client.setQueryData(queryKeys.public('catalog'), ['material'])

    await clearScopedQueries(client)

    expect(client.getQueryData(queryKeys.scoped({ kind: 'site', id: 'site-1' }, 'documents'))).toBeUndefined()
    expect(client.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })

  it('invalidates a resource tree under one scope', async () => {
    const client = createQueryClient()
    const scope = { kind: 'warehouse', id: 'wh-1' } as const
    client.setQueryData(queryKeys.scoped(scope, 'document', 'documents', { page: 1 }), ['list'])
    client.setQueryData(queryKeys.scoped(scope, 'document', 'documents', 'doc-1'), ['detail'])
    client.setQueryData(queryKeys.scoped(scope, 'document', 'documents', 'doc-1', 'history'), ['history'])
    client.setQueryData(queryKeys.scoped(scope, 'catalog', 'materials'), ['catalog'])

    await invalidateResourceTree(client, scope, 'document')

    expect(client.getQueryState(queryKeys.scoped(scope, 'document', 'documents', { page: 1 }))?.isInvalidated).toBe(
      true,
    )
    expect(client.getQueryState(queryKeys.scoped(scope, 'document', 'documents', 'doc-1'))?.isInvalidated).toBe(true)
    expect(
      client.getQueryState(queryKeys.scoped(scope, 'document', 'documents', 'doc-1', 'history'))?.isInvalidated,
    ).toBe(true)
    expect(client.getQueryState(queryKeys.scoped(scope, 'catalog', 'materials'))?.isInvalidated).toBe(false)
  })

  it('invalidates a specific resource instance and its sub-resources', async () => {
    const client = createQueryClient()
    const scope = { kind: 'warehouse', id: 'wh-1' } as const
    client.setQueryData(queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1'), ['detail'])
    client.setQueryData(
      queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1', 'capabilities'),
      ['capabilities'],
    )
    client.setQueryData(
      queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1', 'material-settings', {}),
      ['settings'],
    )
    client.setQueryData(queryKeys.scoped(scope, 'warehouse', 'warehouses', { page: 1 }), ['list'])

    await invalidateResourceInstance(client, scope, 'warehouse', 'warehouses', ['wh-1'])

    expect(
      client.getQueryState(queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1'))?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(
        queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1', 'capabilities'),
      )?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(
        queryKeys.scoped(scope, 'warehouse', 'warehouses', 'wh-1', 'material-settings', {}),
      )?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(queryKeys.scoped(scope, 'warehouse', 'warehouses', { page: 1 }))?.isInvalidated,
    ).toBe(false)
  })

  it('invalidates all list variants for a resource without touching detail', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' } as const
    client.setQueryData(queryKeys.scoped(scope, 'admin', 'users', { page: 1 }), ['list page 1'])
    client.setQueryData(queryKeys.scoped(scope, 'admin', 'users', { page: 2 }), ['list page 2'])
    client.setQueryData(queryKeys.scoped(scope, 'admin', 'users', 'user-1'), ['detail'])
    client.setQueryData(queryKeys.scoped(scope, 'admin', 'users', 'user-2'), ['detail 2'])

    await invalidateResourceLists(client, scope, 'admin', 'users')

    expect(
      client.getQueryState(queryKeys.scoped(scope, 'admin', 'users', { page: 1 }))?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(queryKeys.scoped(scope, 'admin', 'users', { page: 2 }))?.isInvalidated,
    ).toBe(true)
    expect(client.getQueryState(queryKeys.scoped(scope, 'admin', 'users', 'user-1'))?.isInvalidated).toBe(false)
    expect(client.getQueryState(queryKeys.scoped(scope, 'admin', 'users', 'user-2'))?.isInvalidated).toBe(false)
  })

  it('removes protected queries including auth and scoped data', () => {
    const client = createQueryClient()
    client.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'), ['balance'])
    client.setQueryData(['auth', 'session'], { user: 'test' })
    client.setQueryData(queryKeys.public('catalog'), ['material'])

    removeProtectedQueries(client)

    expect(client.getQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'))).toBeUndefined()
    expect(client.getQueryData(['auth', 'session'])).toBeUndefined()
    expect(client.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })

  it('clears protected queries including auth and scoped data', async () => {
    const client = createQueryClient()
    client.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'), ['balance'])
    client.setQueryData(['auth', 'session'], { user: 'test' })
    client.setQueryData(queryKeys.public('catalog'), ['material'])

    await clearProtectedQueries(client)

    expect(client.getQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'))).toBeUndefined()
    expect(client.getQueryData(['auth', 'session'])).toBeUndefined()
    expect(client.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })

  it('does not match resource tree when scope differs', async () => {
    const client = createQueryClient()
    const warehouseScope = { kind: 'warehouse', id: 'wh-1' } as const
    const siteScope = { kind: 'site', id: 'site-1' } as const
    client.setQueryData(queryKeys.scoped(warehouseScope, 'document', 'documents', { page: 1 }), ['wh list'])
    client.setQueryData(queryKeys.scoped(siteScope, 'document', 'documents', { page: 1 }), ['site list'])

    await invalidateResourceTree(client, warehouseScope, 'document')

    expect(
      client.getQueryState(queryKeys.scoped(warehouseScope, 'document', 'documents', { page: 1 }))?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(queryKeys.scoped(siteScope, 'document', 'documents', { page: 1 }))?.isInvalidated,
    ).toBe(false)
  })
})
