import type { AxiosInstance } from 'axios'

import type {
  InventoryCountPlanRequest,
  ListInventoryCountsQuery,
  UpdateCountLinesRequest,
} from '@/modules/inventory-count/types/inventory-count.types'
import { apiClient } from '@/shared/services/api.client'
import { withIdempotencyKey } from '@/shared/services/mutation-safety'
import type {
  InventoryCount,
  InventoryCountLinePage,
  paths,
} from '@/shared/types/generated/eiams-v1'

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
export function createCountService(client: AxiosInstance): CountService {
  return {
    async listCounts(query) {
      const response = await client.get<InventoryCountPageShape>('/inventory-counts', {
        params: query,
      })
      return response.data
    },

    async getCount(countId) {
      const response = await client.get<InventoryCount>(`/inventory-counts/${countId}`)
      return response.data
    },

    async planCount(request, idempotencyKey) {
      const response = await client.post<InventoryCount>(
        '/inventory-counts',
        request,
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },

    async startCount(countId, rowVersion) {
      const response = await client.post<InventoryCount>(`/inventory-counts/${countId}/start`, {
        rowVersion,
      } satisfies RowVersionAction)
      return response.data
    },

    async listLines(countId, query) {
      const response = await client.get<InventoryCountLinePage>(
        `/inventory-counts/${countId}/lines`,
        { params: query },
      )
      return response.data
    },

    async updateLines(countId, request) {
      const response = await client.put<InventoryCountLinePage>(
        `/inventory-counts/${countId}/lines`,
        request,
      )
      return response.data
    },

    async completeCount(countId, rowVersion, idempotencyKey) {
      const response = await client.post<InventoryCount>(
        `/inventory-counts/${countId}/complete`,
        { rowVersion } satisfies RowVersionAction,
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },

    async closeCount(countId, rowVersion) {
      const response = await client.post<InventoryCount>(`/inventory-counts/${countId}/close`, {
        rowVersion,
      })
      return response.data
    },
  }
}

/** Session-scoped singleton bound to the shared axios instance. */
export const countService = createCountService(apiClient)
