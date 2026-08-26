import type { AxiosInstance } from 'axios'

import type {
  AdjustmentDraftRequest,
  ListAdjustmentsQuery,
  ListDisposalEligibleAssetsQuery,
  UpdateAdjustmentRequest,
} from '@/modules/adjustment/types/adjustment.types'
import { apiClient } from '@/shared/services/api.client'
import { withIdempotencyKey } from '@/shared/services/mutation-safety'
import type {
  AdjustmentPostResult,
  AdjustmentReverseResult,
  AssetPage,
  InventoryAdjustment,
  InventoryAdjustmentPage,
} from '@/shared/types/generated/eiams-v1'

const ADJUSTMENTS_PATH = '/adjustments'
const ADJUSTMENT_PATH = '/adjustments/{adjustmentId}'
const ADJUSTMENT_POST_PATH = '/adjustments/{adjustmentId}/post'
const ADJUSTMENT_REVERSE_PATH = '/adjustments/{adjustmentId}/reverse'
const DISPOSAL_ELIGIBLE_ASSETS_PATH = '/adjustments/disposal-eligible-assets'

function pathWithAdjustmentId(path: string, adjustmentId: string): string {
  return path.replace('{adjustmentId}', encodeURIComponent(adjustmentId))
}

/**
 * Builds axios params with conditional spreads so optional filters never leak
 * `undefined` keys onto the wire, keeping the request exactOptional-safe
 * (mirrors the shared document transport).
 */
function toListParams(query: Readonly<ListAdjustmentsQuery>) {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toDisposalEligibleParams(query: Readonly<ListDisposalEligibleAssetsQuery>) {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
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
export function createAdjustmentService(client: AxiosInstance): AdjustmentService {
  return {
    async listAdjustments(query) {
      const response = await client.get<InventoryAdjustmentPage>(ADJUSTMENTS_PATH, {
        params: toListParams(query),
      })
      return response.data
    },

    async getAdjustment(adjustmentId) {
      const response = await client.get<InventoryAdjustment>(
        pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
      )
      return response.data
    },

    async createAdjustment(request) {
      const response = await client.post<InventoryAdjustment>(ADJUSTMENTS_PATH, request)
      return response.data
    },

    async updateAdjustment(adjustmentId, request) {
      const response = await client.put<InventoryAdjustment>(
        pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
        request,
      )
      return response.data
    },

    async postAdjustment(adjustmentId, rowVersion, idempotencyKey) {
      const response = await client.post<AdjustmentPostResult>(
        pathWithAdjustmentId(ADJUSTMENT_POST_PATH, adjustmentId),
        { rowVersion },
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },

    async reverseAdjustment(adjustmentId, rowVersion, reason, idempotencyKey) {
      const response = await client.post<AdjustmentReverseResult>(
        pathWithAdjustmentId(ADJUSTMENT_REVERSE_PATH, adjustmentId),
        { reason, rowVersion },
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },

    async listDisposalEligibleAssets(query) {
      const response = await client.get<AssetPage>(DISPOSAL_ELIGIBLE_ASSETS_PATH, {
        params: toDisposalEligibleParams(query),
      })
      return response.data
    },
  }
}

export const adjustmentService = createAdjustmentService(apiClient)
