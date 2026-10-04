import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  InventoryCountPlanRequest,
  ListInventoryCountsQuery,
  UpdateCountLinesRequest,
} from '@/modules/inventory-count/types/inventory-count.types'
import { pathWithId } from '@/shared/services/api-path'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import type {
  InventoryCount,
  InventoryCountLinePage,
  paths,
} from '@/shared/types/generated/eiams-v1'

const COUNTS_PATH = '/inventory-counts' satisfies keyof paths
const COUNT_PATH = '/inventory-counts/{countId}' satisfies keyof paths
const COUNT_START_PATH = '/inventory-counts/{countId}/start' satisfies keyof paths
const COUNT_LINES_PATH = '/inventory-counts/{countId}/lines' satisfies keyof paths
const COUNT_COMPLETE_PATH = '/inventory-counts/{countId}/complete' satisfies keyof paths
const COUNT_CLOSE_PATH = '/inventory-counts/{countId}/close' satisfies keyof paths

type RowVersionAction =
  paths['/inventory-counts/{countId}/start']['post']['requestBody']['content']['application/json']

export interface CountService {
  listCounts: (query: ListInventoryCountsQuery) => Promise<InventoryCountPageShape>
  getCount: (countId: string) => Promise<InventoryCount>
  planCount: (request: InventoryCountPlanRequest, idempotencyKey: string) => Promise<InventoryCount>
  startCount: (countId: string, rowVersion: number) => Promise<InventoryCount>
  listLines: (countId: string, query: CountLinesQuery) => Promise<InventoryCountLinePage>
  updateLines: (
    countId: string,
    request: UpdateCountLinesRequest,
  ) => Promise<InventoryCountLinePage>
  completeCount: (
    countId: string,
    rowVersion: number,
    idempotencyKey: string,
  ) => Promise<InventoryCount>
  closeCount: (countId: string, rowVersion: number) => Promise<InventoryCount>
}

interface InventoryCountPageShape {
  readonly items: readonly InventoryCount[]
  readonly meta: Readonly<{
    pageIndex: number
    pageSize: number
    totalItems: number
    totalPages: number
  }>
}

interface CountLinesQuery {
  pageIndex?: number
  pageSize?: number
  search?: string
}

/**
 * Contract-backed inventory-count transport (e20-t01). The count lifecycle is
 * a dedicated endpoint family (`/inventory-counts*`), not the document engine:
 * `plan` creates a session, `start` captures the balance snapshot, line entry
 * batches actual quantities through `updateLines`, and `complete`/`close`
 * advance the review lifecycle. `complete` carries an Idempotency-Key.
 */
export function createCountService(transport: ApiTransport): CountService {
  /**
   * Rebuilds a declared page view-model from the transport's normalized
   * `ApiPage`. The generated page types described a body the backend never
   * sends on its own, so unwrapping the envelope by hand here made the declared
   * type and the runtime value disagree. `requestPage` now hands over the
   * normalized page directly.
   */
  const toPage = <T>(page: ApiPage<T>) =>
    ({
      items: page.items,
      meta: {
        pageIndex: page.page - 1,
        page: page.page,
        pageSize: page.pageSize,
        itemCount: page.totalItems,
        totalItems: page.totalItems,
        totalCount: page.totalItems,
        totalPages: page.totalPages,
        hasNextPage: page.hasNextPage,
        hasPreviousPage: page.hasPreviousPage,
      },
    }) as unknown as { items: readonly T[] }

  return {
    async listCounts(query) {
      return toPage(
        await transport.requestPage<InventoryCountPageShape['items'][number]>({
          path: COUNTS_PATH,
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      ) as InventoryCountPageShape
    },

    async getCount(countId) {
      const response = await transport.request<InventoryCount>({
        path: pathWithId(COUNT_PATH, '{countId}', countId),
        method: 'GET',
      })
      return response
    },

    async planCount(request, idempotencyKey) {
      const response = await transport.request<InventoryCount>({
        path: COUNTS_PATH,
        method: 'POST',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response
    },

    async startCount(countId, rowVersion) {
      const response = await transport.request<InventoryCount>({
        path: pathWithId(COUNT_START_PATH, '{countId}', countId),
        method: 'POST',
        body: { rowVersion } satisfies RowVersionAction,
      })
      return response
    },

    async listLines(countId, query) {
      return toPage(
        await transport.requestPage<InventoryCountLinePage['items'][number]>({
          path: pathWithId(COUNT_LINES_PATH, '{countId}', countId),
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      ) as InventoryCountLinePage
    },

    async updateLines(countId, request) {
      const page = await transport.requestPage<InventoryCountLinePage['items'][number]>({
        path: pathWithId(COUNT_LINES_PATH, '{countId}', countId),
        method: 'PUT',
        body: request,
      })
      return toPage(page) as InventoryCountLinePage
    },

    async completeCount(countId, rowVersion, idempotencyKey) {
      const response = await transport.request<InventoryCount>({
        path: pathWithId(COUNT_COMPLETE_PATH, '{countId}', countId),
        method: 'POST',
        body: { rowVersion } satisfies RowVersionAction,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response
    },

    async closeCount(countId, rowVersion) {
      const response = await transport.request<InventoryCount>({
        path: pathWithId(COUNT_CLOSE_PATH, '{countId}', countId),
        method: 'POST',
        body: { rowVersion } satisfies RowVersionAction,
      })
      return response
    },
  }
}

/** Session-scoped singleton bound to the shared transport. */
export const countService = createCountService(apiTransport)
