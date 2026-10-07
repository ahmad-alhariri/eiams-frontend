import type { ApiTransport } from '@/shared/api/api-transport'
import type { ApiPage } from '@/shared/api/api-contracts'
import { apiTransport } from '@/shared/api/transport'
import type { PageMeta } from '@/shared/types/generated/eiams-v1'
import type {
  AssetPage,
  DashboardReport,
  InventoryAdjustmentPage,
  InventoryBalancePage,
  WarehouseDocumentPage,
  paths,
} from '@/shared/types/generated/eiams-v1'

import type {
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListDashboardReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'

const REPORTS_INVENTORY_PATH = '/reports/inventory' satisfies keyof paths
const REPORTS_ASSETS_PATH = '/reports/assets' satisfies keyof paths
const REPORTS_COUNT_ADJUSTMENT_PATH = '/reports/count-adjustments' satisfies keyof paths
const REPORTS_DOCUMENTS_PATH = '/reports/documents' satisfies keyof paths
const REPORTS_DASHBOARD_PATH = '/reports/dashboard' satisfies keyof paths

/**
 * The wire query shape every `ApiRequest` accepts. Annotating the builders with
 * it (rather than letting them return an inferred anonymous object) keeps
 * `exactOptionalPropertyTypes` honest: a filter is either present with a value
 * or absent entirely, never present as `undefined`.
 */
type ReportQueryParams = Readonly<Record<string, string | number | boolean | undefined>>

/**
 * Conditional spread builders for each reports endpoint. Mirrors
 * `adjustment.service.ts` §`toListParams`: only declared parameters are
 * forwarded, never `undefined`, so `exactOptionalPropertyTypes` stays clean
 * and the wire request never leaks empty keys.
 */
function toInventoryReportParams(query: Readonly<ListInventoryReportQuery>): ReportQueryParams {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toAssetReportParams(query: Readonly<ListAssetReportQuery>): ReportQueryParams {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toCountAdjustmentReportParams(
  query: Readonly<ListCountAdjustmentReportQuery>,
): ReportQueryParams {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
  }
}

function toOperationalDocumentsReportParams(
  query: Readonly<ListOperationalDocumentsReportQuery>,
): ReportQueryParams {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
  }
}

/**
 * Dashboard report — all four parameters forwarded; server applies own defaults.
 * No pageIndex/pageSize (singleton response). Per D-RPT-02: server owns
 * aggregation, date-boundary, null/zero treatment, and series bucket width.
 */
function toDashboardReportParams(query: Readonly<ListDashboardReportQuery>): ReportQueryParams {
  return {
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
  }
}

/**
 * Rebuilds the declared `{ items, meta: PageMeta }` report body from the
 * transport's normalized `ApiPage`.
 *
 * The four list endpoints answer with a bare `data` array plus a SIBLING
 * `pagination` block, which is exactly what `requestPage` reads — so the wire
 * shape is unwrapped once, in the transport, and never here. What remains is
 * the documented view-model the tables render (`page.meta.totalItems`,
 * `page.meta.totalPages`), reconstructed from server-owned numbers rather than
 * from anything computed locally.
 *
 * `pageIndex` is reported zero-based because the reports query contract is
 * zero-based (the tables send `currentPage - 1`), while `ApiPage.page` is
 * 1-based per `docs/direct-backend-integration-plan.md` §5.2.
 */
function toReportPage<TItem>(page: ApiPage<TItem>): {
  items: ReadonlyArray<TItem>
  meta: PageMeta
} {
  return {
    items: page.items,
    meta: {
      pageIndex: page.page - 1,
      pageSize: page.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
    },
  }
}

export interface ReportsService {
  /**
   * Inventory balance report — server-owned projection; the response is
   * authoritative for low-stock state and provenance (D-INV-READ-01).
   */
  getInventoryReport: (query: Readonly<ListInventoryReportQuery>) => Promise<InventoryBalancePage>
  /**
   * Asset & custody report — server-derived status; the client never infers
   * lifecycle from other records (D-RPT-01 §"Asset and custody reports").
   */
  getAssetReport: (query: Readonly<ListAssetReportQuery>) => Promise<AssetPage>
  /**
   * Count & adjustment report — adjustment purpose/state and count lifecycle
   * retain their server-defined meanings (D-RPT-01 §"Count and adjustment
   * report"). No client variance calculation.
   */
  getCountAdjustmentReport: (
    query: Readonly<ListCountAdjustmentReportQuery>,
  ) => Promise<InventoryAdjustmentPage>
  /**
   * Operational documents report — server document spine projection
   * (D-RPT-01 §"Operational documents report").
   */
  getOperationalDocumentsReport: (
    query: Readonly<ListOperationalDocumentsReportQuery>,
  ) => Promise<WarehouseDocumentPage>
  /**
   * Dashboard report — KPI cards + trend/distribution series (D-RPT-02).
   * Singleton response; server owns all aggregation and series bucket definitions.
   */
  getDashboardReport: (query: Readonly<ListDashboardReportQuery>) => Promise<DashboardReport>
}

/**
 * Contract-backed reports transport (e23-t05/t07/t08/t09). Every call passes
 * only the parameters declared by the corresponding operation; no aggregation,
 * no client-side sorting or grouping.
 *
 * Takes the shared `ApiTransport`, never an `AxiosInstance`: the envelope is
 * unwrapped once in `createAxiosTransport` (`docs/feature-service-composition-standard.md`),
 * which is why no method here reads `.data`. List endpoints go through
 * `requestPage` and the singleton dashboard through `request`; failures are
 * thrown by the transport already normalized, so this service neither unwraps
 * an error nor converts one into a successful result.
 */
export function createReportsService(transport: ApiTransport): ReportsService {
  return {
    async getInventoryReport(query) {
      const page = await transport.requestPage<InventoryBalancePage['items'][number]>({
        path: REPORTS_INVENTORY_PATH,
        method: 'GET',
        query: toInventoryReportParams(query),
      })
      return toReportPage(page)
    },

    async getAssetReport(query) {
      const page = await transport.requestPage<AssetPage['items'][number]>({
        path: REPORTS_ASSETS_PATH,
        method: 'GET',
        query: toAssetReportParams(query),
      })
      return toReportPage(page)
    },

    async getCountAdjustmentReport(query) {
      const page = await transport.requestPage<InventoryAdjustmentPage['items'][number]>({
        path: REPORTS_COUNT_ADJUSTMENT_PATH,
        method: 'GET',
        query: toCountAdjustmentReportParams(query),
      })
      return toReportPage(page)
    },

    async getOperationalDocumentsReport(query) {
      const page = await transport.requestPage<WarehouseDocumentPage['items'][number]>({
        path: REPORTS_DOCUMENTS_PATH,
        method: 'GET',
        query: toOperationalDocumentsReportParams(query),
      })
      return toReportPage(page)
    },

    async getDashboardReport(query) {
      const response = await transport.request<DashboardReport>({
        path: REPORTS_DASHBOARD_PATH,
        method: 'GET',
        query: toDashboardReportParams(query),
      })
      return response
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Built at module
// evaluation, never as `{} as any` — that default is what made the first runtime
// list call throw. `createReportsService` is the test seam, so a test exercises
// the same code path against an isolated transport.
export const reportsService = createReportsService(apiTransport)
