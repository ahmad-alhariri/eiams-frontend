import type { operations } from '@/shared/types/generated/eiams-v1'

/**
 * Contract-derived query parameter types for the v1 reports endpoints
 * (D-RPT-01, `docs/reports-kpi-contract-decision.md`).
 *
 * Every type is derived directly from the corresponding OpenAPI operation
 * via `operations['<name>']['parameters']['query']`. No hand-written DTO is
 * permitted to compete with the contract — if the contract surface changes,
 * regenerate the types (`pnpm api:types:generate`) and these update for free.
 *
 * The "Allowed query parameters" column of D-RPT-01 §"V1 contract matrix"
 * is the authoritative whitelist. Anything absent here is not forwarded to the
 * server.
 */

/** Inventory balance report — `GET /reports/inventory`. */
export type ListInventoryReportQuery = NonNullable<
  operations['getInventoryReport']['parameters']['query']
>

/** Asset & custody report — `GET /reports/assets`. */
export type ListAssetReportQuery = NonNullable<operations['getAssetReport']['parameters']['query']>

/** Count & adjustment report — `GET /reports/count-adjustments`. */
export type ListCountAdjustmentReportQuery = NonNullable<
  operations['getCountAdjustmentReport']['parameters']['query']
>

/** Operational documents report — `GET /reports/documents`. */
export type ListOperationalDocumentsReportQuery = NonNullable<
  operations['getDocumentReport']['parameters']['query']
>

/**
 * Tab keys for the `/reports` page panel switcher. The order matches the
 * display order and the page-default is `'recentActivity'`. Every key maps
 * to one server projection or composition (D-RPT-01 §"V1 contract matrix").
 */
export type ReportsTabKey =
  | 'recentActivity'
  | 'inventoryBalance'
  | 'stockMovement'
  | 'assetCustody'
  | 'countAdjustment'
  | 'operationalDocuments'
