import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  clearScopedQueries,
  invalidateScopedQueries,
  queryKeys,
  removeScopedQueries,
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
      client.getQueryState(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'documents'))
        ?.isInvalidated,
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

    expect(
      client.getQueryData(queryKeys.scoped({ kind: 'site', id: 'site-1' }, 'documents')),
    ).toBeUndefined()
    expect(client.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })
})
