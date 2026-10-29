import type { AssetCurrentStatus } from '@/modules/asset/types/asset.types'
import type { DocumentStatus, DocumentType } from '@/shared/documents/types/document-wire.types'

/**
 * Handwritten wire contracts for the Reports module (D-INT-02 / ADR-0001,
 * `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md`).
 *
 * The backend is authoritative for the serialized shape, so every type below is
 * transcribed from the record it describes:
 *
 * - `GET /reports/inventory`        → `Application/Reports/Inventory/InventoryReportRow.cs:3-9`
 * - `GET /reports/assets`           → `Application/Reports/Assets/AssetsReportRow.cs:3-8`
 * - `GET /reports/count-adjustments` → `Application/Reports/CountAdjustments/CountAdjustmentsReportRow.cs:3-13`
 * - `GET /reports/documents`         → `Application/Reports/Documents/DocumentsReportRow.cs:3-11`
 * - `GET /reports/dashboard`         → `Application/Reports/Dashboard/DashboardReportResponse.cs:3-11`
 *
 * The frozen design snapshot (the generated artifact, since deleted)
 * described a different world for these endpoints: asset rows with a material
 * and a custodian, adjustment documents, warehouse documents, and a dashboard of
 * KPI codes with trend/distribution series. NONE of that is on the wire. The
 * four list endpoints answer with per-warehouse SUMMARY rows, and the dashboard
 * answers with flat counters. Nothing here may be typed against the snapshot.
 *
 * Pagination is ONE-based on the wire: the controllers bind
 * `PaginationQueryParameters`
 * (`Web.Api/Infrastructure/PaginationQueryParameters.cs:8-12`), whose `Page` is
 * `[Range(1, MaximumPage)]` and `PageSize` is `[Range(1, 100)]`. Every list
 * query below therefore carries a one-based `page`, and the service routes it
 * through the shared `toWireOneBasedPaginationParams` clamp.
 */

/**
 * `GET /reports/inventory` row (`InventoryReportRow`).
 *
 * The endpoint is a per-material SUMMARY grouped by the server
 * (`Application/Reports/Inventory/GetInventoryReportQueryHandler.cs`), not a
 * balance list. `totalQuantity` is the server's `decimal` sum and arrives as a
 * JSON number.
 */
export interface InventoryReportRow {
  readonly materialId: string
  readonly materialCode: string
  readonly materialNameAr: string
  readonly totalQuantity: number
  readonly warehouseCount: number
  readonly lastUpdatedUtc: string
}

/**
 * `GET /reports/assets` row (`AssetsReportRow`).
 *
 * One row per (warehouse, current status) pair: the server groups the scoped
 * assets and counts them
 * (`Application/Reports/Assets/GetAssetsReportQueryHandler.cs:37-44`), so the
 * row carries a COUNT, never an asset identity. `currentStatus` is the live
 * `Domain.Common.AssetCurrentStatus` name (the handler writes
 * `current.CurrentStatus.ToString()`), so the asset module's own vocabulary
 * applies.
 */
export interface AssetsReportRow {
  readonly warehouseId: string
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly currentStatus: AssetCurrentStatus
  readonly assetCount: number
}

/**
 * `GET /reports/count-adjustments` row (`CountAdjustmentsReportRow`).
 *
 * One row per warehouse, aggregating the counts and the adjustments of that
 * warehouse inside the requested date window
 * (`Application/Reports/CountAdjustments/GetCountAdjustmentsReportQueryHandler.cs`).
 * The two variances are the server's `decimal` sums and arrive as JSON
 * numbers; the frontend never recomputes them.
 */
export interface CountAdjustmentsReportRow {
  readonly warehouseId: string
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly countCount: number
  readonly closedCountCount: number
  readonly varianceLineCount: number
  readonly netVariance: number
  readonly adjustmentCount: number
  readonly postedAdjustmentCount: number
  readonly adjustmentDifference: number
}

/**
 * `GET /reports/documents` row (`DocumentsReportRow`).
 *
 * One row per (warehouse, document type, document status) triple with the
 * server's counts and the newest timestamps of that group
 * (`Application/Reports/Documents/GetDocumentsReportQueryHandler.cs:40-58`).
 * `documentType` / `documentStatus` are the live enum names (the handler
 * writes `.ToString()` of `Domain.Common.DocumentType` / `DocumentStatus`).
 */
export interface DocumentsReportRow {
  readonly warehouseId: string
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly documentType: DocumentType
  readonly documentStatus: DocumentStatus
  readonly documentCount: number
  readonly latestCreatedAtUtc: string | null
  readonly latestPostedAtUtc: string | null
}

/**
 * `GET /reports/dashboard` response (`DashboardReportResponse`).
 *
 * A singleton of flat counters — there is NO kpi list and NO series on the
 * wire (`Application/Reports/Dashboard/GetDashboardReportQueryHandler.cs:88-96`).
 * The four nullable counters are `null` when the server may not compute them
 * (the handler nulls them out per permission), which is why they are nullable
 * here rather than zero.
 */
export interface DashboardReport {
  readonly warehouseCount: number
  readonly stockedMaterialCount: number
  readonly totalOnHandQuantity: number
  readonly assetCount: number | null
  readonly activeCustodyCount: number | null
  readonly openDocumentCount: number | null
  readonly activeInventoryCountCount: number | null
  readonly generatedAtUtc: string
}

/**
 * `GET /reports/inventory` query — the live parameters and NOTHING else.
 *
 * The controller binds `warehouseId`, `materialId`, `search` and the
 * one-based pagination (`Web.Api/Controllers/Reports/GetInventoryReportController.cs:25-30`).
 */
export interface ListInventoryReportQuery {
  readonly warehouseId?: string
  readonly search?: string
  readonly page?: number
  readonly pageSize?: number
}

/**
 * `GET /reports/assets` query.
 *
 * The controller binds `warehouseId`, `status` (`Domain.Common.AssetCurrentStatus`)
 * and the one-based pagination
 * (`Web.Api/Controllers/Reports/GetAssetsReportController.cs:26-30`). It binds
 * NO `search`, so the report must not offer one.
 */
export interface ListAssetReportQuery {
  readonly warehouseId?: string
  readonly status?: AssetCurrentStatus
  readonly page?: number
  readonly pageSize?: number
}

/**
 * `GET /reports/count-adjustments` query.
 *
 * The controller binds `warehouseId`, `fromUtc`, `toUtc` and the one-based
 * pagination
 * (`Web.Api/Controllers/Reports/GetCountAdjustmentsReportController.cs:25-30`).
 */
export interface ListCountAdjustmentReportQuery {
  readonly warehouseId?: string
  readonly fromUtc?: string
  readonly toUtc?: string
  readonly page?: number
  readonly pageSize?: number
}

/**
 * `GET /reports/documents` query.
 *
 * The controller binds `warehouseId`, `documentType`, `status`, `fromUtc`,
 * `toUtc` and the one-based pagination
 * (`Web.Api/Controllers/Reports/GetDocumentsReportController.cs:26-33`). The v1
 * report surface exposes the warehouse and the date window only; the type and
 * status filters are declared here so a future filter cannot invent a
 * parameter the server does not bind.
 */
export interface ListOperationalDocumentsReportQuery {
  readonly warehouseId?: string
  readonly documentType?: DocumentType
  readonly status?: DocumentStatus
  readonly fromUtc?: string
  readonly toUtc?: string
  readonly page?: number
  readonly pageSize?: number
}

/**
 * `GET /reports/dashboard` query.
 *
 * The controller binds `warehouseId` and NOTHING else
 * (`Web.Api/Controllers/Reports/GetDashboardReportController.cs:23`). The
 * snapshot-era `siteId` / `dateFrom` / `dateTo` were never bound, so they are
 * not sent.
 */
export interface ListDashboardReportQuery {
  readonly warehouseId?: string
}

/**
 * Tab keys for the `/reports` page panel switcher. The order matches the
 * display order and the page-default is `'dashboard'`. Every key maps to one
 * server projection or composition.
 */
export type ReportsTabKey =
  | 'dashboard'
  | 'recentActivity'
  | 'inventoryBalance'
  | 'stockMovement'
  | 'assetCustody'
  | 'countAdjustment'
  | 'operationalDocuments'
