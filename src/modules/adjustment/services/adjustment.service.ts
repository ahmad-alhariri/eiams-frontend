import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  AdjustmentDraftRequest,
  AdjustmentDetail,
  AdjustmentListItem,
  AdjustmentUpdateRequest,
  DisposalDraftRequest,
  DisposalEligibleAsset,
  ListAdjustmentsQuery,
  ListDisposalEligibleAssetsQuery,
} from '@/modules/adjustment/types/adjustment.types'
import { toWirePaginationParams } from '@/shared/api/pagination'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import type { ApiPage, ResourceIdResponse } from '@/shared/api/api-contracts'
import type { PostDocumentResponse } from '@/shared/documents/types/document-wire.types'
import type { paths } from '@/shared/types/generated/eiams-v1'

const ADJUSTMENTS_PATH = '/adjustments' satisfies keyof paths
const ADJUSTMENT_PATH = '/adjustments/{adjustmentId}' satisfies keyof paths
const ADJUSTMENT_POST_PATH = '/adjustments/{adjustmentId}/post' satisfies keyof paths
const ADJUSTMENT_REVERSE_PATH = '/adjustments/{adjustmentId}/reverse' satisfies keyof paths
const DISPOSAL_ELIGIBLE_ASSETS_PATH = '/adjustments/disposal-eligible-assets' satisfies keyof paths

/**
 * The LIVE disposal endpoint.
 *
 * It is not in the frozen generated snapshot (that artifact describes the
 * provisional design, not the served API), so the path is spelled out here
 * rather than asserted against `keyof paths`.
 */
const DISPOSALS_PATH = '/adjustments/disposals'

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
  listAdjustments: (query: Readonly<ListAdjustmentsQuery>) => Promise<ApiPage<AdjustmentListItem>>
  getAdjustment: (adjustmentId: string) => Promise<AdjustmentDetail>
  createAdjustment: (request: Readonly<AdjustmentDraftRequest>) => Promise<AdjustmentDetail>
  updateAdjustment: (
    adjustmentId: string,
    request: Readonly<AdjustmentUpdateRequest>,
  ) => Promise<AdjustmentDetail>
  /**
   * Posts the draft; requires an Idempotency-Key for retry-safe execution.
   * Returns the shared engine's `{ documentId, warnings }` projection.
   */
  postAdjustment: (
    adjustmentId: string,
    rowVersion: number,
    idempotencyKey: string,
  ) => Promise<PostDocumentResponse>
  /**
   * Reverses a posted ordinary adjustment through a compensating document;
   * requires an Idempotency-Key. The server rejects reversal for disposal.
   * Returns the compensating document's id only (201 `{ id }`).
   */
  reverseAdjustment: (
    adjustmentId: string,
    rowVersion: number,
    reason: string,
    idempotencyKey: string,
  ) => Promise<ResourceIdResponse>
  listDisposalEligibleAssets: (
    query: Readonly<ListDisposalEligibleAssetsQuery>,
  ) => Promise<ApiPage<DisposalEligibleAsset>>
  /**
   * Creates the disposal DRAFT through the LIVE disposal endpoint
   * (`POST /adjustments/disposals`).
   *
   * The body is `{ warehouseId, assetIds, reason }` and nothing else — the
   * server derives the signed effect itself, and it refuses a request that
   * carries two or more assets. The response is the shared `{ id }`
   * projection; the adjustment's own id also travels in the `Location`
   * header.
   */
  createDisposalDraft: (request: Readonly<DisposalDraftRequest>) => Promise<ResourceIdResponse>
}

/**
 * Contract-backed adjustment transport (D-INT-02). Adjustments own the
 * `/adjustments` endpoint family and are NOT served by the shared document
 * engine: docs/adjustment-workflow-decision.md establishes every adjustment
 * (disposal included) as a manager-owned exception whose only lifecycle is
 * Draft → Posted → Reversed. The API remains authoritative: policy and the
 * SignedOriginal gate are read through the shared document engine under the
 * SAME document id (the adjustment's `id`), posting eligibility, optimistic-
 * concurrency conflicts, and the terminal non-reversible disposal state.
 */
export function createAdjustmentService(transport: ApiTransport): AdjustmentService {
  return {
    async listAdjustments(query) {
      return transport.requestPage<AdjustmentListItem>({
        path: ADJUSTMENTS_PATH,
        method: 'GET',
        query: toListParams(query),
      })
    },

    async getAdjustment(adjustmentId) {
      return transport.request<AdjustmentDetail>({
        path: pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
        method: 'GET',
      })
    },

    async createAdjustment(request) {
      return transport.request<AdjustmentDetail>({
        path: ADJUSTMENTS_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateAdjustment(adjustmentId, request) {
      return transport.request<AdjustmentDetail>({
        path: pathWithAdjustmentId(ADJUSTMENT_PATH, adjustmentId),
        method: 'PUT',
        body: request,
      })
    },

    async postAdjustment(adjustmentId, rowVersion, idempotencyKey) {
      return transport.request<PostDocumentResponse>({
        path: pathWithAdjustmentId(ADJUSTMENT_POST_PATH, adjustmentId),
        method: 'POST',
        body: { rowVersion },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async reverseAdjustment(adjustmentId, rowVersion, reason, idempotencyKey) {
      return transport.request<ResourceIdResponse>({
        path: pathWithAdjustmentId(ADJUSTMENT_REVERSE_PATH, adjustmentId),
        method: 'POST',
        body: { reason, rowVersion },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async listDisposalEligibleAssets(query) {
      return transport.requestPage<DisposalEligibleAsset>({
        path: DISPOSAL_ELIGIBLE_ASSETS_PATH,
        method: 'GET',
        query: toDisposalEligibleParams(query),
      })
    },

    async createDisposalDraft(request) {
      return transport.request<ResourceIdResponse>({
        path: DISPOSALS_PATH,
        method: 'POST',
        body: request,
      })
    },
  }
}

export const adjustmentService = createAdjustmentService(apiTransport)
