import type { AdjustmentPurpose, AdjustmentStatus } from '@/shared/types/generated/eiams-v1'
import type { DocumentStatus } from '@/shared/documents/types/document-wire.types'

export type { AdjustmentPurpose }

/**
 * Handwritten wire contract for the adjustment module (D-INT-02).
 *
 * Adjustment is a manager-owned exception to the shared document engine
 * (docs/adjustment-workflow-decision.md): a dedicated `/adjustments` endpoint
 * family, the lifecycle `Draft → Posted → Reversed` only — there is no
 * Submitted/Approved/Cancelled state — and three purposes: `CountVariance`
 * (count-linked variance lines), `DirectCorrection` (signed stock-difference
 * lines), and `Disposal` (exactly one asset-backed line at quantity −1;
 * terminal and never reversible in v1).
 *
 * Transcribed from the live backend DTOs
 * (`Application.InventoryAdjustments.{GetList,GetById}`): flat camelCase rows —
 * NO embedded policy, attachments, documentId, documentReference or createdBy.
 * Policy and attachments are separate reads keyed by the shared document
 * engine, whose `documentId` equals the adjustment's own `id`.
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

export type ListAdjustmentsQuery = {
  pageIndex?: number
  pageSize?: number
  purpose?: AdjustmentPurpose
  status?: AdjustmentStatus
  warehouseId?: string
}

export type ListDisposalEligibleAssetsQuery = {
  pageIndex?: number
  pageSize?: number
  search?: string
  warehouseId?: string
}

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
