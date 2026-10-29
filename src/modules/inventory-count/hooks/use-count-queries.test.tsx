import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiJson, okPageJson } from '@/test/msw/envelope'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
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

/**
 * The normalized `ApiPage` a lines read resolves to: the live transport
 * normalizes the snake_case wire pagination into these camelCase keys.
 */
function seededPage(page: number, pageSize: number, totalItems: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  return {
    items: [],
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
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
        onClick={() => mutation.mutate({ actuals: [], expectedRowVersion: 3 })}
      >
        حفظ
      </button>
    )
  }

  it('refreshes both the whole-session review and the paged entry read', async () => {
    // RESOLUTION-025: the live save is PUT /inventory-counts/{countId}/actuals;
    // it answers with an empty body and the hook invalidates the read keys itself.
    server.use(http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, () => apiJson({})))
    const client = createClient()
    // The review reads `allLines`; the quantity-entry workspace reads a paged
    // `lines` page. A line save must refresh both or the completion gate would
    // be computed from a stale collection.
    const allLines = countQueryKeys.allLines(SCOPE, COUNT_ID)
    const pagedLines = countQueryKeys.lines(SCOPE, COUNT_ID, {
      page: 1,
      pageSize: 25,
    })

    client.setQueryData(allLines, [])
    client.setQueryData(pagedLines, seededPage(1, 25, 205))

    const user = userEvent.setup()
    render(withClient(client, <SaveProbe />))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(client.getQueryState(allLines)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(pagedLines)?.isInvalidated).toBe(true)
  }, 20000)

  it('invalidates every count read under the factory-built resource prefix', async () => {
    // The target is `queryKeys.scoped(scope, 'inventory-counts')`, so it must
    // reach the detail and freeze-status branches too — not only the lines
    // branch the previous test seeds.
    server.use(http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, () => apiJson({})))
    const client = createClient()
    const detail = countQueryKeys.count(SCOPE, COUNT_ID)
    const freeze = countQueryKeys.freezeStatus(SCOPE, '823e4567-e89b-42d3-a456-426614174008')
    client.setQueryData(detail, null)
    client.setQueryData(freeze, null)

    const user = userEvent.setup()
    render(withClient(client, <SaveProbe />))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(client.getQueryState(detail)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(freeze)?.isInvalidated).toBe(true)
  }, 20000)

  it('over-invalidates sibling sessions in the same scope (known, pre-existing)', async () => {
    // Documented trade-off rather than desired behaviour: every count mutation
    // shares `useCountInvalidation`, which sweeps the whole
    // [scoped, ..., inventory-counts] resource prefix. That is safe (never
    // stale) but imprecise, and it contradicts the "exact keys" clause of
    // docs/feature-service-composition-standard.md. Pinned here so a future
    // move to precise per-count invalidation is a deliberate, visible change
    // across all count mutations at once.
    server.use(http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, () => apiJson({})))
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

describe('useUpdateCountLinesMutation idempotency key (RESOLUTION-025)', () => {
  const BATCH = {
    actuals: [{ lineId: 'L1', actualQuantity: 5 }],
    expectedRowVersion: 4,
  }
  const OTHER_BATCH = {
    actuals: [{ lineId: 'L2', actualQuantity: 7 }],
    expectedRowVersion: 4,
  }

  /**
   * Answers the semantic actuals route and records the key each attempt
   * carried. `failures` decides how many attempts fail before the route
   * answers 200.
   */
  function useActualsHandler(keys: (string | null)[], failures: number) {
    server.use(
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        if (keys.length <= failures) {
          return apiJson({ error: { code: 'x', message: 'boom' } }, { status: 500 })
        }
        return apiJson({})
      }),
    )
  }

  async function save(
    result: { current: { mutateAsync: (request: typeof BATCH) => Promise<unknown> } },
    request: typeof BATCH,
  ) {
    await act(async () => {
      await result.current.mutateAsync(request).catch(() => undefined)
    })
  }

  it('reuses the key when the SAME batch is sent again after a failure', async () => {
    // The client cannot know whether a failed attempt landed, so the operator's
    // next save of the same batch is an EQUIVALENT retry and must carry the
    // SAME key: the server then answers with the original result instead of
    // applying the batch a second time.
    const keys: (string | null)[] = []
    useActualsHandler(keys, 1)
    const client = createClient()
    const { result } = renderHook(() => useUpdateCountLinesMutation(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await save(result, BATCH)
    await save(result, BATCH)

    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  }, 20000)

  it('issues a NEW key for a different batch, and a new key after a success', async () => {
    // The server pairs a key with the request it was issued for, so a
    // different batch must not reuse the previous key. A SUCCESSFUL batch ends
    // that execution: the next save is a new user-approved action.
    const keys: (string | null)[] = []
    useActualsHandler(keys, 0)
    const client = createClient()
    const { result } = renderHook(() => useUpdateCountLinesMutation(COUNT_ID), {
      wrapper: ({ children }) => withClient(client, children),
    })

    await save(result, BATCH)
    await save(result, OTHER_BATCH)
    await save(result, BATCH)

    expect(keys).toHaveLength(3)
    expect(keys[1]).not.toBe(keys[0])
    // The third attempt repeats the first batch, but the first one SUCCEEDED,
    // so it is a new execution and gets a new key.
    expect(keys[2]).not.toBe(keys[0])
  }, 20000)
})

describe('useAllCountLinesQuery', () => {
  /**
   * Server-paged handler (1-based). The session spans several `pageSize`
   * pages so the fan-out is genuinely exercised rather than a single-page read.
   */
  function usePagedHandler(totalItems: number) {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page') ?? '1')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(ALL_LINES_PAGE_SIZE))
        const start = (page - 1) * pageSize
        const size = Math.max(0, Math.min(pageSize, totalItems - start))
        return okPageJson(
          Array.from({ length: size }, (_u, i) => ({
            id: `L${start + i + 1}`,
            materialId: `m${start + i + 1}`,
            assetId: null,
            snapshotQuantity: 4,
            actualQuantity: start + i + 1,
            difference: start + i - 3,
            varianceReason: null,
          })),
          {
            page,
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
    expect(result.current.data?.[0]?.id).toBe('L1')
    expect(result.current.data?.[449]?.id).toBe('L450')
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
      expect(line.difference).toBe((line.actualQuantity ?? 0) - line.snapshotQuantity)
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
