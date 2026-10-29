import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  CancelCountRequest,
  CountPage,
  CountRowVersionRequest,
  InventoryCount,
  InventoryCountLine,
  InventoryCountListItem,
  InventoryFreezeStatus,
  ListCountLinesQuery,
  ListCountsQuery,
  PlanCountRequest,
  ResourceId,
  SetLineVarianceReasonRequest,
  UpdateCountLinesRequest,
  UpdateCountStatusRequest,
  UpdateFreezePolicyRequest,
  UpdateLineActualRequest,
} from '@/modules/inventory-count/types/inventory-count.types'
import { pathWithId } from '@/shared/services/api-path'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'

const COUNTS_PATH = '/inventory-counts'
const COUNT_PATH = '/inventory-counts/{countId}'
const COUNT_START_PATH = '/inventory-counts/{countId}/start'
const COUNT_COMPLETE_PATH = '/inventory-counts/{countId}/complete'
const COUNT_CLOSE_PATH = '/inventory-counts/{countId}/close'
const COUNT_CANCEL_PATH = '/inventory-counts/{countId}/cancel'
const COUNT_STATUS_PATH = '/inventory-counts/{countId}/status'
const COUNT_FREEZE_POLICY_PATH = '/inventory-counts/{countId}/freeze-policy'
const COUNT_LINES_PATH = '/inventory-counts/{countId}/lines'
const COUNT_LINE_ACTUAL_PATH = '/inventory-counts/{countId}/lines/{lineId}/actual'
const COUNT_LINE_VARIANCE_REASON_PATH = '/inventory-counts/{countId}/lines/{lineId}/variance-reason'
const COUNT_ACTUALS_PATH = '/inventory-counts/{countId}/actuals'
const COUNT_ADJUSTMENT_PATH = '/inventory-counts/{countId}/adjustment'
const FREEZE_STATUS_PATH = '/warehouses/{warehouseId}/inventory-freeze-status'

export interface CountService {
  listCounts: (query: ListCountsQuery) => Promise<CountPage<InventoryCountListItem>>
  getCount: (countId: string) => Promise<InventoryCount>
  planCount: (request: PlanCountRequest, idempotencyKey: string) => Promise<ResourceId>
  startCount: (countId: string, expectedRowVersion: number) => Promise<void>
  listLines: (countId: string, query: ListCountLinesQuery) => Promise<CountPage<InventoryCountLine>>
  updateLines: (
    countId: string,
    request: UpdateCountLinesRequest,
    idempotencyKey: string,
  ) => Promise<void>
  updateLineActual: (
    countId: string,
    lineId: string,
    request: UpdateLineActualRequest,
  ) => Promise<void>
  setLineVarianceReason: (
    countId: string,
    lineId: string,
    request: SetLineVarianceReasonRequest,
  ) => Promise<void>
  completeCount: (
    countId: string,
    expectedRowVersion: number,
    idempotencyKey: string,
  ) => Promise<void>
  closeCount: (countId: string, expectedRowVersion: number) => Promise<void>
  cancelCount: (countId: string, request: CancelCountRequest) => Promise<void>
  setCountStatus: (countId: string, request: UpdateCountStatusRequest) => Promise<void>
  setFreezePolicy: (countId: string, request: UpdateFreezePolicyRequest) => Promise<void>
  createAdjustment: (countId: string, idempotencyKey: string) => Promise<ResourceId>
  getFreezeStatus: (warehouseId: string) => Promise<InventoryFreezeStatus>
}

/** Fills both path parameters of a per-line route, URI-encoded. */
function linePath(template: string, countId: string, lineId: string): string {
  return pathWithId(pathWithId(template, '{countId}', countId), '{lineId}', lineId)
}

/**
 * Live inventory-count transport (IC-FE-1). Reads are paged 1-based through the
 * shared `transport.requestPage` normalizer (snake_case wire `page_size` /
 * `total_items` → camelCase); the count list and the lines read are both paged
 * this way and no module-local pagination fabrication exists (F5). Lifecycle
 * mutations answer with no body, so they go through `requestEmpty` and the
 * hooks invalidate + refetch after success. The count actuals batch is such a
 * mutation too: `PUT /{countId}/actuals` answers `ApiResponse<EmptyResponse>`
 * on the live API, so the affected lines and the new count version are read
 * back rather than merged from a response the server does not send.
 */
export function createCountService(transport: ApiTransport): CountService {
  return {
    async listCounts(query) {
      return transport.requestPage<InventoryCountListItem>({
        path: COUNTS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
    },

    async getCount(countId) {
      return transport.request<InventoryCount>({
        path: pathWithId(COUNT_PATH, '{countId}', countId),
        method: 'GET',
      })
    },

    async planCount(request, idempotencyKey) {
      // 201 + `{ id }`; the caller navigates and the detail page refetches.
      return transport.request<ResourceId, PlanCountRequest>({
        path: COUNTS_PATH,
        method: 'POST',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async startCount(countId, expectedRowVersion) {
      await transport.requestEmpty<CountRowVersionRequest>({
        path: pathWithId(COUNT_START_PATH, '{countId}', countId),
        method: 'POST',
        body: { expectedRowVersion },
      })
    },

    async listLines(countId, query) {
      return transport.requestPage<InventoryCountLine>({
        path: pathWithId(COUNT_LINES_PATH, '{countId}', countId),
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
    },

    async updateLines(countId, request, idempotencyKey) {
      // RESOLUTION-025: the SEMANTIC actuals command, `PUT
      // /inventory-counts/{countId}/actuals` — it replaced the generic
      // writable `/lines` route, which the backend never had a PUT for.
      //
      // The body is CLOSED: `{ actuals: [{ lineId, actualQuantity }],
      // expectedRowVersion }` and nothing else. The backend's strict count body
      // filter answers 400 for any unknown top-level key, so a per-line
      // `rowVersion` or a `reason` would be rejected outright.
      //
      // The `Idempotency-Key` makes an EQUIVALENT retry (the same batch sent
      // again after an uncertain outcome) replayable server-side, as
      // RESOLUTION-025 requires. The live API accepts the header but does not
      // yet replay on it — that is backend work, tracked with the resolution.
      //
      // The answer is `ApiResponse<EmptyResponse>`: the live route returns no
      // authoritative result envelope (no count header, no new row version, no
      // affected line projections), so the hook invalidates and refetches the
      // count + lines instead of merging a response that does not exist.
      await transport.requestEmpty<UpdateCountLinesRequest>({
        path: pathWithId(COUNT_ACTUALS_PATH, '{countId}', countId),
        method: 'PUT',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async updateLineActual(countId, lineId, request) {
      await transport.requestEmpty<UpdateLineActualRequest>({
        path: linePath(COUNT_LINE_ACTUAL_PATH, countId, lineId),
        method: 'PUT',
        body: request,
      })
    },

    async setLineVarianceReason(countId, lineId, request) {
      await transport.requestEmpty<SetLineVarianceReasonRequest>({
        path: linePath(COUNT_LINE_VARIANCE_REASON_PATH, countId, lineId),
        method: 'PUT',
        body: request,
      })
    },

    async completeCount(countId, expectedRowVersion, idempotencyKey) {
      await transport.requestEmpty<CountRowVersionRequest>({
        path: pathWithId(COUNT_COMPLETE_PATH, '{countId}', countId),
        method: 'POST',
        body: { expectedRowVersion },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async closeCount(countId, expectedRowVersion) {
      await transport.requestEmpty<CountRowVersionRequest>({
        path: pathWithId(COUNT_CLOSE_PATH, '{countId}', countId),
        method: 'POST',
        body: { expectedRowVersion },
      })
    },

    async cancelCount(countId, request) {
      await transport.requestEmpty<CancelCountRequest>({
        path: pathWithId(COUNT_CANCEL_PATH, '{countId}', countId),
        method: 'POST',
        body: request,
      })
    },

    async setCountStatus(countId, request) {
      await transport.requestEmpty<UpdateCountStatusRequest>({
        path: pathWithId(COUNT_STATUS_PATH, '{countId}', countId),
        method: 'PUT',
        body: request,
      })
    },

    async setFreezePolicy(countId, request) {
      await transport.requestEmpty<UpdateFreezePolicyRequest>({
        path: pathWithId(COUNT_FREEZE_POLICY_PATH, '{countId}', countId),
        method: 'PUT',
        body: request,
      })
    },

    async createAdjustment(countId, idempotencyKey) {
      // The dedicated draft endpoint: no request body, 201 + `{ id }` (F8).
      return transport.request<ResourceId>({
        path: pathWithId(COUNT_ADJUSTMENT_PATH, '{countId}', countId),
        method: 'POST',
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
    },

    async getFreezeStatus(warehouseId) {
      return transport.request<InventoryFreezeStatus>({
        path: pathWithId(FREEZE_STATUS_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
      })
    },
  }
}

/** Session-scoped singleton bound to the shared transport. */
export const countService = createCountService(apiTransport)
