import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import {
  countQueryKeys,
  useAllCountLinesQuery,
  useUpdateCountLinesMutation,
} from './use-count-queries'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000003'
const OTHER_COUNT_ID = '00000000-0000-4000-8000-0000000000ff'
const SCOPE: ScopeCacheKey = { kind: 'enterprise' }

function session(): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'count.operator',
      displayName: 'مشغّل الجرد',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: ['count.view', 'count.enter'],
    availableScopes: [
      { scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة العامة للرقابة والتفتيش' },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, session())
  return client
}

function emptyPage(pageIndex: number, pageSize: number, totalItems: number) {
  return {
    items: [],
    meta: {
      pageIndex,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  }
}

function withClient(client: QueryClient, children: ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useUpdateCountLinesMutation invalidation (hbfu)', () => {
  function SaveProbe() {
    const mutation = useUpdateCountLinesMutation(COUNT_ID)
    return (
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ countRowVersion: 3, lines: [] })}
      >
        حفظ
      </button>
    )
  }

  it('invalidates every page of the edited session and leaves other sessions cached', async () => {
    server.use(
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json(emptyPage(0, 25, 0)),
      ),
    )
    const client = createClient()
    const pageZero = countQueryKeys.lines(SCOPE, COUNT_ID, { pageIndex: 0, pageSize: 25 })
    const pageOne = countQueryKeys.lines(SCOPE, COUNT_ID, { pageIndex: 1, pageSize: 25 })
    const otherCount = countQueryKeys.lines(SCOPE, OTHER_COUNT_ID, { pageIndex: 0, pageSize: 25 })
    const countDetail = countQueryKeys.count(SCOPE, COUNT_ID)
    const countList = countQueryKeys.counts(SCOPE, { page: 0, pageSize: 10 } as never)

    client.setQueryData(pageZero, emptyPage(0, 25, 205))
    client.setQueryData(pageOne, emptyPage(1, 25, 205))
    client.setQueryData(otherCount, emptyPage(0, 25, 30))
    client.setQueryData(countDetail, { countId: COUNT_ID })
    client.setQueryData(countList, emptyPage(0, 10, 1))

    const user = userEvent.setup()
    render(withClient(client, <SaveProbe />))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(client.getQueryState(pageZero)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(pageOne)?.isInvalidated).toBe(true)
    expect(client.getQueryState(countDetail)?.isInvalidated).toBe(true)
    // A line save must not sweep unrelated operational data.
    expect(client.getQueryState(otherCount)?.isInvalidated).toBe(false)
    expect(client.getQueryState(countList)?.isInvalidated).toBe(false)
  }, 20000)
})

describe('useAllCountLinesQuery (hbfu)', () => {
  const REVIEW_PAGE_SIZE = 100

  function usePagedHandler(totalItems: number) {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(REVIEW_PAGE_SIZE))
        const start = pageIndex * pageSize
        return HttpResponse.json({
          items: Array.from(
            { length: Math.max(0, Math.min(pageSize, totalItems - start)) },
            (_u, i) => ({
              countLineId: `L${start + i + 1}`,
              material: { id: `m${start + i + 1}`, displayName: `مادة ${start + i + 1}` },
              snapshotQuantity: 1,
              actualQuantity: 1,
              difference: 0,
              rowVersion: 1,
            }),
          ),
          meta: {
            pageIndex,
            pageSize,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
          },
        })
      }),
    )
  }

  it('joins every server page of the session into one ordered collection', async () => {
    usePagedHandler(150)
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.totalItems).toBe(150)
    expect(result.current.lines).toHaveLength(150)
    expect(result.current.lines[0]?.countLineId).toBe('L1')
    expect(result.current.lines[149]?.countLineId).toBe('L150')
  }, 20000)

  it('reports an oversized session instead of returning a partial collection', async () => {
    usePagedHandler(10_001)
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await waitFor(() => {
      expect(result.current.isOversized).toBe(true)
    })
    expect(result.current.isError).toBe(false)
  }, 20000)

  it('surfaces the read error so the review can offer a retry', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json({ error: { code: 'x', message: 'boom' } }, { status: 500 }),
      ),
    )
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  }, 20000)

  it('stays idle without a session id', () => {
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(null), {
      wrapper: ({ children }) => withClient(client, children),
    })

    expect(result.current.lines).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })
})
