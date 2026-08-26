import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAsset, createAssetCustody, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import { useAssetCustodyTimelineQuery, useAssetQuery, useAssetsQuery } from './use-asset-queries'
import { createQueryClient } from '@/shared/services/query.client'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('asset query hooks', () => {
  it('reads the scoped registry with derived-status filters', async () => {
    const row = createAsset()
    let requestedSearch = ''
    server.use(
      http.get(`${API_BASE_URL}/assets`, ({ request }) => {
        const url = new URL(request.url)
        requestedSearch = url.search
        return HttpResponse.json(createPage([row]))
      }),
    )

    const { result } = renderHook(
      () => useAssetsQuery({ pageIndex: 0, pageSize: 10, status: 'InStock' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(requestedSearch).toContain('status=InStock')
    expect(result.current.data?.items[0]?.assetId).toBe(row.assetId)
  })

  it('stays disabled until the session scope is ready', () => {
    activeScope.key = undefined
    server.use(
      http.get(`${API_BASE_URL}/assets`, () => {
        throw new Error('no asset request should fire without an active scope')
      }),
    )

    const { result } = renderHook(() => useAssetsQuery({ pageIndex: 0, pageSize: 10 }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('reads one asset and its custody timeline by id', async () => {
    const row = createAsset({ assetId: '11111111-1111-4111-8111-111111111111' })
    server.use(
      http.get(`${API_BASE_URL}/assets/${row.assetId}`, () => HttpResponse.json(row)),
      http.get(`${API_BASE_URL}/assets/${row.assetId}/custody`, () =>
        HttpResponse.json([createAssetCustody({ assetId: row.assetId })]),
      ),
    )

    const detail = renderHook(() => useAssetQuery(row.assetId), { wrapper: createWrapper() })
    const custody = renderHook(() => useAssetCustodyTimelineQuery(row.assetId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(detail.result.current.data).toBeDefined())
    expect(detail.result.current.data?.assetNumber).toBe(row.assetNumber)
    await waitFor(() => expect(custody.result.current.data).toBeDefined())
    expect(custody.result.current.data).toHaveLength(1)
  })
})
