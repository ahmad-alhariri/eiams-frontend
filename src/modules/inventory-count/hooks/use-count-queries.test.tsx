import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiJson, okPageJson } from '@/test/msw/envelope'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
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
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000003'
const OTHER_COUNT_ID = '00000000-0000-4000-8000-0000000000ff'
const SCOPE: ScopeCacheKey = { kind: 'enterprise' }

/** Page size `listAllCountLines` requests. */
const ALL_LINES_PAGE_SIZE = 200

function session(): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مشغّل الجرد' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: ['count.view', 'count.enter'],
  }
}

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, session())
  return client
}

// Two distinct shapes, deliberately not shared: an MSW handler must serve the
// WIRE envelope, while `setQueryData` seeds the SERVICE's view-model. Wrapping
// one in the other silently produces an unusable cache entry or an empty page.
function emptyWirePage(pageIndex: number, pageSize: number, totalItems: number) {
  return okPageJson([], {
    page: pageIndex + 1,
    pageSize,
    totalCount: totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  })
}

/** The view-model `countService.listLines` resolves to. */
function emptyViewPage(pageIndex: number, pageSize: number, totalItems: number) {
  return {
    items: [],
    meta: {
      pageIndex,
      page: pageIndex + 1,
      pageSize,
      itemCount: totalItems,
      totalItems,
      totalCount: totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }
}

function withClient(client: QueryClient, children: ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useUpdateCountLinesMutation invalidation', () => {
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

  it('refreshes both the whole-session review and the paged entry read', async () => {
    server.use(
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        emptyWirePage(0, ALL_LINES_PAGE_SIZE, 0),
      ),
    )
    const client = createClient()
    // The review reads `allLines`; the quantity-entry workspace reads a paged
    // `lines` page. A line save must refresh both or the completion gate would
    // be computed from a stale collection.
    const allLines = countQueryKeys.allLines(SCOPE, COUNT_ID)
    const pagedLines = countQueryKeys.lines(SCOPE, COUNT_ID, {
      pageIndex: 1,
      pageSize: 25,
    })

    client.setQueryData(allLines, [])
    client.setQueryData(pagedLines, emptyViewPage(1, 25, 205))

    const user = userEvent.setup()
    render(withClient(client, <SaveProbe />))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(client.getQueryState(allLines)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(pagedLines)?.isInvalidated).toBe(true)
  }, 20000)

  it('over-invalidates sibling sessions in the same scope (known, pre-existing)', async () => {
    // Documented trade-off rather than desired behaviour: every count mutation
    // shares `useCountInvalidation`, which sweeps the whole
    // [scoped, ..., inventory-counts] resource prefix. That is safe (never
    // stale) but imprecise, and it contradicts the "exact keys" clause of
    // docs/feature-service-composition-standard.md. Pinned here so a future
    // move to precise per-count invalidation is a deliberate, visible change
    // across all five count mutations at once.
    server.use(
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        emptyWirePage(0, ALL_LINES_PAGE_SIZE, 0),
      ),
    )
    const client = createClient()
    const otherCount = countQueryKeys.allLines(SCOPE, OTHER_COUNT_ID)
    client.setQueryData(otherCount, [])

    const user = userEvent.setup()
    render(withClient(client, <SaveProbe />))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(client.getQueryState(otherCount)?.isInvalidated).toBe(true)
    })
  }, 20000)
})

describe('useAllCountLinesQuery', () => {
  /**
   * Server-paged handler. The session spans several `pageSize` pages so the
   * fan-out is genuinely exercised rather than a single-page read.
   */
  function usePagedHandler(totalItems: number) {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(ALL_LINES_PAGE_SIZE))
        const start = pageIndex * pageSize
        const size = Math.max(0, Math.min(pageSize, totalItems - start))
        return okPageJson(
          Array.from({ length: size }, (_u, i) => ({
            countLineId: `L${start + i + 1}`,
            material: { id: `m${start + i + 1}`, displayName: `مادة ${start + i + 1}` },
            snapshotQuantity: 4,
            actualQuantity: start + i + 1,
            difference: start + i - 3,
            rowVersion: 1,
          })),
          {
            page: pageIndex + 1,
            pageSize,
            totalCount: totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
          },
        )
      }),
    )
  }

  it('joins every server page into one ordered collection', async () => {
    usePagedHandler(450)
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toHaveLength(450)
    expect(result.current.data?.[0]?.countLineId).toBe('L1')
    expect(result.current.data?.[449]?.countLineId).toBe('L450')
  }, 20000)

  it('preserves the server difference on every joined line', async () => {
    usePagedHandler(450)
    const client = createClient()
    const { result } = renderHook(() => useAllCountLinesQuery(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    // The read must not recompute: every line's difference equals the wire value.
    for (const line of result.current.data ?? []) {
      expect(line.difference).toBe(line.actualQuantity! - line.snapshotQuantity)
    }
  }, 20000)

  it('surfaces the read error so the review can offer a retry', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        apiJson({ error: { code: 'x', message: 'boom' } }, { status: 500 }),
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

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})
