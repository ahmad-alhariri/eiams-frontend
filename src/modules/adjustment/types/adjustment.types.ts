import type { Asset } from '@/modules/asset/types/asset.types'
import type { DocumentStatus } from '@/shared/documents/types/document-wire.types'

/**
 * The adjustment's purpose — the wire's `AdjustmentKind`
 * (`Domain.Common.AdjustmentKind`): the count-variance draft, the
 * direct-correction draft and the terminal disposal.
 */
export type AdjustmentPurpose = 'CountVariance' | 'DirectCorrection' | 'Disposal'

/**
 * The adjustment's OWN lifecycle — the wire's `InventoryAdjustmentStatus`
 * (`Domain.Common.InventoryAdjustmentStatus`): `Draft → Posted → Reversed`.
 *
 * It is NOT the shared document engine's `DocumentStatus`, which the same
 * payload carries separately under `documentStatus` (a wider vocabulary that
 * also holds `Submitted`, `Cancelled` and `Rejected`).
 */
export type AdjustmentStatus = 'Draft' | 'Posted' | 'Reversed'

/**
 * Handwritten wire contract for the adjustment module (D-INT-02).
 *
 * Adjustment is a manager-owned exception to the shared document engine
 * (docs/adjustment-workflow-decision.md): a dedicated `/adjustments` endpoint
 * family, the lifecycle `Draft → Posted → Reversed` only — there is no
 * Submitted/Approved/Cancelled state — and three purposes: `CountVariance`
 * (count-linked variance lines), `DirectCorrection` (signed stock-difference
 * lines), and `Disposal` (exactly one asset; terminal and never reversible in
 * v1).
 *
 * Transcribed from the live backend DTOs
 * (`Application.InventoryAdjustments.{GetList,GetById}`): flat camelCase rows —
 * NO embedded policy, attachments, documentId, documentReference or createdBy.
 * Policy and attachments are separate reads keyed by the shared document
 * engine, whose `documentId` equals the adjustment's own `id`.
 *
 * The purpose and lifecycle strings are the Domain enums' own `ToString()`
 * values: `Domain.Common.AdjustmentKind` and
 * `Domain.Common.InventoryAdjustmentStatus`.
 */

export type AdjustmentLineRequest = {
  /** Server-side line identity, present only when updating an existing line. */
  adjustmentLineId?: string
  materialId: string
  /** Signed stock delta: positive = increase, negative = decrease. */
  quantityDelta: number
  reason: string
  assetId?: string
}

export type AdjustmentDraftRequest = {
  warehouseId: string
  purpose: AdjustmentPurpose
  reason: string
  /** Present only for CountVariance; the creation endpoint rejects it otherwise. */
  countId?: string
  lines: readonly AdjustmentLineRequest[]
  rowVersion: number
}

export type AdjustmentUpdateRequest = {
  rowVersion: number
  reason?: string
  lines: readonly AdjustmentLineRequest[]
  /** Purpose and countId are IMMUTABLE after create — they are not accepted here. */
}

/**
 * `GET /adjustments` filters.
 *
 * `page` is the WIRE page and it is ONE-based: the backend binds
 * `PaginationQueryParameters.Page` (`[Range(1, 21474836)]`, default 1), and
 * `useServerPagination` produces one-based pages, so the number crosses the
 * boundary unchanged. There is deliberately no `pageIndex` and no `- 1` here:
 * subtracting one is what put `page=0` on the wire, which the backend answers
 * with 400 `REQUEST_VALIDATION_FAILED`.
 */
export type ListAdjustmentsQuery = {
  page?: number
  pageSize?: number
  purpose?: AdjustmentPurpose
  status?: AdjustmentStatus
  warehouseId?: string
}

/** `GET /adjustments/disposal-eligible-assets` filters; `page` is ONE-based. */
export type ListDisposalEligibleAssetsQuery = {
  page?: number
  pageSize?: number
  search?: string
  warehouseId?: string
}

/**
 * The body of `POST /api/v1/adjustments/disposals` — the LIVE disposal
 * endpoint, which is NOT the generic `POST /api/v1/adjustments` draft
 * endpoint (that one takes `purpose`/`lines`/`countId`/`rowVersion` and is
 * reserved for the count-variance and direct-correction forms).
 *
 * The body carries NO effect, NO material and NO line: the server derives the
 * signed difference itself (−1 for an `InStock` asset, 0 for an already
 * `Issued` or `InCustody` one) and refuses anything else. A client that sends
 * a `quantityDelta` is sending a field the server does not bind.
 *
 * `assetIds` holds EXACTLY ONE id: the server refuses two or more with HTTP
 * 400 `DISPOSALS_SINGLE_ASSET_REQUIRED` (`details.asset_count`).
 */
export type DisposalDraftRequest = {
  warehouseId: string
  assetIds: readonly string[]
  reason: string
}

/**
 * One row of `GET /api/v1/adjustments/disposal-eligible-assets`.
 *
 * This is the LIVE flat asset row (`id`, `assetNumber`, `materialNameAr`,
 * `currentStatus`, …) projected onto the fields that endpoint serves: it
 * returns no `activeCustodyId`, `holderType`, `holderId`, `acquisitionDate`
 * or `warrantyExpiry`. The projection is a `Pick` of the asset module's live
 * `Asset` type rather than a second declaration, so the asset vocabulary stays
 * owned by the asset module.
 *
 * `currentStatus` is the SERVER's derived state and it is what decides the
 * disposal effect: `InStock` → −1, `Issued`/`InCustody` → 0. A `Disposed`
 * asset is never served here — the endpoint filters it out.
 */
export type DisposalEligibleAsset = Pick<
  Asset,
  | 'id'
  | 'assetNumber'
  | 'serialNumber'
  | 'materialId'
  | 'materialCode'
  | 'materialNameAr'
  | 'warehouseId'
  | 'warehouseCode'
  | 'warehouseName'
  | 'currentStatus'
  | 'rowVersion'
>

/** `Application.InventoryAdjustments.GetList.InventoryAdjustmentResponse`. */
export type AdjustmentListItem = {
  id: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  countId: string | null
  purpose: AdjustmentPurpose
  status: AdjustmentStatus
  reason: string
  systemReferenceNumber: string
  documentStatus: DocumentStatus
  lineCount: number
  totalDifference: number
  createdAtUtc: string
  postedAtUtc: string | null
  rowVersion: number
}

/** One server-issued asset row of an adjustment line. */
export type AdjustmentLineAsset = {
  id: string
  assetNumber: string
  serialNumber: string | null
}

/** `Application.InventoryAdjustments.GetList.InventoryAdjustmentLineResponse`. */
export type AdjustmentLineResponse = {
  lineId: string
  materialId: string
  materialCode: string
  materialNameAr: string
  quantity: number
  difference: number
  reason: string
  assets: readonly AdjustmentLineAsset[]
}

/**
 * `Application.InventoryAdjustments.GetList.InventoryAdjustmentDetailsResponse` —
 * the detail, create and update read model (201/200 bodies of the module's own
 * endpoints).
 */
export type AdjustmentDetail = {
  id: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  countId: string | null
  purpose: AdjustmentPurpose
  status: AdjustmentStatus
  reason: string
  systemReferenceNumber: string
  documentStatus: DocumentStatus
  createdAtUtc: string
  postedAtUtc: string | null
  rowVersion: number
  lines: readonly AdjustmentLineResponse[]
}

/** Arabic labels for the adjustment purposes (D-ADJ-01). */
export const ADJUSTMENT_PURPOSE_LABELS_AR = {
  CountVariance: 'تسوية فروقات الجرد',
  DirectCorrection: 'تسوية مباشرة',
  Disposal: 'إعدام أصل',
} as const

/** Arabic labels for the manager-owned adjustment lifecycle. */
export const ADJUSTMENT_STATUS_LABELS_AR = {
  Draft: 'مسودة',
  Posted: 'مرحّل',
  Reversed: 'معكوس',
} as const

/**
 * Disposal is terminal in v1 — the UI never renders a reversal action for a
 * disposal adjustment because the server rejects it outright.
 */
export function isDisposalPurpose(purpose: AdjustmentPurpose): boolean {
  return purpose === 'Disposal'
}
