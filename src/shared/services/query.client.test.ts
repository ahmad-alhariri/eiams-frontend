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
    expect(options.queries?.retry).toBeTypeOf('function')
    expect(options.queries?.refetchOnWindowFocus).toBe(false)
    expect(options.queries?.refetchOnReconnect).toBe(true)
  })

  it('retries a transient failure once but never a permanent 4xx', async () => {
    async function attemptsFor(failure: unknown): Promise<number> {
      const client = createQueryClient()
      let attempts = 0

      await expect(
        client.fetchQuery({
          queryKey: ['retry-policy'],
          retryDelay: 0,
          queryFn: () => {
            attempts += 1
            return Promise.reject(failure)
          },
        }),
      ).rejects.toBeTruthy()

      return attempts
    }

    function httpFailure(status: number) {
      return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
    }

    // Permanent: the server's answer will not change, so one attempt only.
    expect(await attemptsFor(httpFailure(404))).toBe(1)
    expect(await attemptsFor(httpFailure(422))).toBe(1)
    // Still retried: network failure, timeout, throttling and server errors.
    expect(await attemptsFor(new Error('Network Error'))).toBe(2)
    expect(await attemptsFor(httpFailure(408))).toBe(2)
    expect(await attemptsFor(httpFailure(429))).toBe(2)
    expect(await attemptsFor(httpFailure(500))).toBe(2)
  })

  it('exports the longer master-data policy without creating a second client', () => {
    const client = createQueryClient()

    expect(MASTER_DATA_STALE_TIME).toBe(300_000)
    expect(MASTER_DATA_STALE_TIME).toBeGreaterThan(OPERATIONAL_STALE_TIME)
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })
})
