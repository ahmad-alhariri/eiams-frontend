/**
 * Handwritten wire contracts for the Asset module (D-INT-02 / ADR-0001).
 *
 * These types describe what the LIVE API serves, not the frozen design
 * snapshot (`src/shared/types/generated/eiams-v1.ts`). The snapshot's rows were
 * nested (`material: { displayName }`, `currentWarehouse: { displayName }`,
 * `holder: { displayName }`) and carried a `derivedStatus` field; the live
 * rows are FLAT and camelCase, and the status field is `currentStatus`. Every
 * property below is verified against the live swagger and the backend DTOs:
 *
 * - `Application.Assets.GetList.AssetResponse`            -> `Asset`
 * - `Application.Assets.GetById.AssetDetailsResponse`      -> `AssetDetails`
 * - `Application.Assets.GetCurrentStatus.AssetCurrentStatusResponse` -> `AssetCurrentStatusInfo`
 * - `Application.Assets.GetMovements.AssetMovementResponse`-> `AssetMovement`
 * - `Application.Custodies.GetTimeline.AssetCustodyTimelineResponse` -> `AssetCustodyTimelineRow`
 *
 * The snapshot is a provisional design artifact and is NOT the wire: the live
 * asset row carries `materialNameAr` + `warehouseName` and NO `materialNameEn`
 * and NO holder display name, so nothing here may invent one.
 */
import type { CustodyKind } from '@/modules/custody/types/custody.types'
import type { CounterpartType } from '@/modules/organization/types/counterpart-lookup.types'

/** Live `Domain.Common.AssetCurrentStatus` — the five served states. */
export type AssetCurrentStatus = 'InStock' | 'Issued' | 'InCustody' | 'Disposed' | 'Unknown'

/** Live `Domain.Common.AssetMovementType` — the immutable movement vocabulary. */
export type AssetMovementType =
  'Received' | 'Transferred' | 'Issued' | 'Returned' | 'Disposed' | 'OpeningRegistered'

/**
 * `GET /assets` row (`AssetResponse`).
 *
 * `acquisitionDate` is a non-nullable `DateOnly` on the server, so it is
 * non-nullable here; everything the server may leave empty is `| null`.
 */
export interface Asset {
  readonly id: string
  readonly assetNumber: string
  readonly serialNumber: string | null
  readonly materialId: string
  readonly materialCode: string
  readonly materialNameAr: string
  readonly warehouseId: string
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly currentStatus: AssetCurrentStatus
  readonly activeCustodyId: string | null
  readonly holderType: CounterpartType | null
  readonly holderId: string | null
  readonly acquisitionDate: string
  readonly warrantyExpiry: string | null
  readonly rowVersion: number
}

/** `GET /assets/{assetId}` row (`AssetDetailsResponse`) — the list row plus the detail-only fields. */
export interface AssetDetails extends Asset {
  readonly materialNameEn: string | null
  readonly custodyKind: CustodyKind | null
  readonly latestMovementType: AssetMovementType | null
  readonly latestMovementAtUtc: string | null
  readonly receiptLineId: string | null
  readonly receiptDocumentId: string | null
  readonly receiptDocumentReference: string | null
}

/**
 * `GET /assets/{assetId}/current-status` row (`AssetCurrentStatusResponse`).
 *
 * The DERIVED status projection (`v_asset_current_status`): the server-owned
 * view of where the asset stands right now, including who holds it.
 */
export interface AssetCurrentStatusInfo {
  readonly assetId: string
  readonly materialId: string
  readonly warehouseId: string | null
  readonly assetNumber: string
  readonly serialNumber: string | null
  readonly currentStatus: AssetCurrentStatus
  readonly activeCustodyId: string | null
  readonly holderType: CounterpartType | null
  readonly holderId: string | null
  readonly custodyKind: CustodyKind | null
  readonly latestMovementType: AssetMovementType | null
  readonly latestMovementAtUtc: string | null
}

/** `GET /assets/{assetId}/movements` row (`AssetMovementResponse`). */
export interface AssetMovement {
  readonly id: string
  readonly assetId: string
  readonly documentId: string
  readonly documentReferenceNumber: string
  readonly documentType: string
  readonly movementType: AssetMovementType
  readonly movedAtUtc: string
}

/**
 * `GET /assets/{assetId}/custody-timeline` row (`AssetCustodyTimelineResponse`).
 *
 * The holder travels as `holderType` + `holderId`; the live row carries NO
 * holder display name, so the UI shows the typed pair rather than inventing one.
 */
export interface AssetCustodyTimelineRow {
  readonly custodyId: string
  readonly assetId: string
  readonly holderType: CounterpartType
  readonly holderId: string
  readonly custodyKind: CustodyKind
  readonly issueDocumentId: string
  readonly returnDocumentId: string | null
  /** `Active` for an open custody row, `Closed` for a returned one. */
  readonly status: 'Active' | 'Closed'
  readonly fromUtc: string
  readonly toUtc: string | null
  readonly rowVersion: number
}

/**
 * `GET /assets` query — the live parameters and NOTHING else.
 *
 * The server binds `warehouseId`, `materialId`, `status`, `search`, `page`
 * (ONE-based) and `pageSize`; it has no `pageIndex`, no `sortBy` and no
 * `sortDirection`, so neither can be sent.
 */
export interface ListAssetsQuery {
  readonly warehouseId?: string
  readonly materialId?: string
  readonly status?: AssetCurrentStatus
  readonly search?: string
  readonly page?: number
  readonly pageSize?: number
}

/** `GET /assets/{assetId}/movements` query — pagination only. */
export interface ListAssetMovementsQuery {
  readonly page?: number
  readonly pageSize?: number
}
