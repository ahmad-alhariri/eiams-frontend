import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  AdjustmentDraftRequest,
  ListAdjustmentsQuery,
  ListDisposalEligibleAssetsQuery,
  UpdateAdjustmentRequest,
} from '@/modules/adjustment/types/adjustment.types'
import { toWirePaginationParams } from '@/shared/api/pagination'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import type {
  AdjustmentPostResult,
  AdjustmentReverseResult,
  AssetPage,
  InventoryAdjustment,
  InventoryAdjustmentPage,
  paths,
} from '@/shared/types/generated/eiams-v1'

const ADJUSTMENTS_PATH = '/adjustments' satisfies keyof paths
const ADJUSTMENT_PATH = '/adjustments/{adjustmentId}' satisfies keyof paths
const ADJUSTMENT_POST_PATH = '/adjustments/{adjustmentId}/post' satisfies keyof paths
const ADJUSTMENT_REVERSE_PATH = '/adjustments/{adjustmentId}/reverse' satisfies keyof paths
const DISPOSAL_ELIGIBLE_ASSETS_PATH = '/adjustments/disposal-eligible-assets' satisfies keyof paths

function pathWithAdjustmentId(path: string, adjustmentId: string): string {
  return path.replace('{adjustmentId}', encodeURIComponent(adjustmentId))
}

/**
 * Builds axios params so optional filters never leak `undefined` keys onto the
 * wire, keeping the request exactOptional-safe (mirrors the shared document
 * transport). Page conversion is delegated to the shared boundary so the
 * one-based UI model and the zero-based wire index are converted in one place.
 */
function toListParams(query: Readonly<ListAdjustmentsQuery>) {
  return {
    ...toWirePaginationParams(query),
    ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toDisposalEligibleParams(query: Readonly<ListDisposalEligibleAssetsQuery>) {
  return {
    ...toWirePaginationParams(query),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

export interface AdjustmentService {
  listAdjustments: (query: Readonly<ListAdjustmentsQuery>) => Promise<InventoryAdjustmentPage>
  getAdjustment: (adjustmentId: string) => Promise<InventoryAdjustment>
  createAdjustment: (request: Readonly<AdjustmentDraftRequest>) => Promise<InventoryAdjustment>
  updateAdjustment: (
    adjustmentId: string,
    request: Readonly<UpdateAdjustmentRequest>,
  ) => Promise<InventoryAdjustment>
  /** Posts the draft; requires an Idempotency-Key for retry-safe execution. */
  postAdjustment: (
    adjustmentId: string,
    rowVersion: number,
    idempotencyKey: string,
  ) => Promise<AdjustmentPostResult>
  /**
   * Reverses a posted ordinary adjustment through a compensating document;
   * requires an Idempotency-Key. The server rejects reversal for disposal.
   */
  reverseAdjustment: (
    adjustmentId: string,
    rowVersion: number,
    reason: string,
    idempotencyKey: string,
  ) => Promise<AdjustmentReverseResult>
  listDisposalEligibleAssets: (
    query: Readonly<ListDisposalEligibleAssetsQuery>,
  ) => Promise<AssetPage>
}

/**
 * Contract-backed adjustment transport (e21-t01). Adjustments own the
 * `/adjustments` endpoint family and are NOT served by the shared document
 * engine: docs/adjustment-workflow-decision.md establishes every adjustment
 * (disposal included) as a manager-owned exception whose only lifecycle is
 * Draft → Posted → Reversed. The API remains authoritative for policy
 * evaluation, posting eligibility (the SignedOriginal gate included),
 * optimistic-concurrency conflicts, and the terminal non-reversible disposal
 * state.
 */
export function createAdjustmentService(transport: ApiTransport): AdjustmentService {
  return {
    async listAdjustments(query) {
      const page = await transport.requestPage<InventoryAdjustment>({
        path: ADJUSTMENTS_PATH,
        method: 'GET',
        query: toListParams(query),
      })
      // The generated `InventoryAdjustmentPage` described a body the backend
      // never sends on its own. Rebuild the documented view-model from the
      // normalized `ApiPage` so the declared type and the runtime value agree.
      return {
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
      } as InventoryAdjustmentPage
    },

    async getAdjustment(adjustmentId) {
      const response = await transport.request<InventoryAdjustment>({
        path: pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
        method: 'GET',
      })
      return response.data
    },

    async createAdjustment(request) {
      const response = await transport.request<InventoryAdjustment>({
        path: ADJUSTMENTS_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateAdjustment(adjustmentId, request) {
      const response = await transport.request<InventoryAdjustment>({
        path: pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async postAdjustment(adjustmentId, rowVersion, idempotencyKey) {
      const response = await transport.request<AdjustmentPostResult>({
        path: pathWithAdjustmentId(ADJUSTMENT_POST_PATH, adjustmentId),
        method: 'POST',
        body: { rowVersion },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response.data
    },

    async reverseAdjustment(adjustmentId, rowVersion, reason, idempotencyKey) {
      const response = await transport.request<AdjustmentReverseResult>({
        path: pathWithAdjustmentId(ADJUSTMENT_REVERSE_PATH, adjustmentId),
        method: 'POST',
        body: { reason, rowVersion },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response.data
    },

    async listDisposalEligibleAssets(query) {
      const page = await transport.requestPage<AssetPage['items'][number]>({
        path: DISPOSAL_ELIGIBLE_ASSETS_PATH,
        method: 'GET',
        query: toDisposalEligibleParams(query),
      })
      return {
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
      } as AssetPage
    },
  }
}

export const adjustmentService = createAdjustmentService(apiTransport)
