import { describe, expect, it } from 'vitest'

import {
  MASTER_DATA_STALE_TIME,
  OPERATIONAL_STALE_TIME,
  QUERY_GC_TIME,
  createQueryClient,
} from '@/shared/services/query.client'

describe('TanStack Query policies', () => {
  it('uses a short default freshness window for operational data', () => {
    const client = createQueryClient()
    const options = client.getDefaultOptions()

    expect(OPERATIONAL_STALE_TIME).toBe(30_000)
    expect(options.queries?.staleTime).toBe(OPERATIONAL_STALE_TIME)
    expect(options.queries?.gcTime).toBe(QUERY_GC_TIME)
    expect(options.queries?.retry).toBe(1)
    expect(options.queries?.refetchOnWindowFocus).toBe(false)
    expect(options.queries?.refetchOnReconnect).toBe(true)
  })

  it('exports the longer master-data policy without creating a second client', () => {
    const client = createQueryClient()

    expect(MASTER_DATA_STALE_TIME).toBe(300_000)
    expect(MASTER_DATA_STALE_TIME).toBeGreaterThan(OPERATIONAL_STALE_TIME)
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })
})
