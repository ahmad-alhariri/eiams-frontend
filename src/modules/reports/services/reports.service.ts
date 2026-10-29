import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'

import type {
  AssetsReportRow,
  CountAdjustmentsReportRow,
  DashboardReport,
  DocumentsReportRow,
  InventoryReportRow,
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListDashboardReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'

const REPORTS_INVENTORY_PATH = '/reports/inventory'
const REPORTS_ASSETS_PATH = '/reports/assets'
const REPORTS_COUNT_ADJUSTMENT_PATH = '/reports/count-adjustments'
const REPORTS_DOCUMENTS_PATH = '/reports/documents'
const REPORTS_DASHBOARD_PATH = '/reports/dashboard'

/**
 * The wire query shape every `ApiRequest` accepts. Annotating the builders with
 * it (rather than letting them return an inferred anonymous object) keeps
 * `exactOptionalPropertyTypes` honest: a filter is either present with a value
 * or absent entirely, never present as `undefined`.
 */
type ReportQueryParams = Readonly<Record<string, string | number | boolean | undefined>>

/**
 * Sends a list query through the ONE shared pagination clamp.
 *
 * `page` is ONE-based on both sides — `useServerPagination` produces a one-based
 * page and the wire `PaginationQueryParameters.Page` is `Range(1, 21474836)` —
 * so the helper only clamps it into the range the server binds. The
 * snapshot-era zero-based `pageIndex` is gone: the controller never bound it,
 * so every list used to stay pinned on its first page.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): ReportQueryParams {
  const { page, pageSize, ...filters } = query
  return {
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  }
}

export interface ReportsService {
  /**
   * Inventory report — server-owned per-material summary; the response is
   * authoritative for totals and provenance.
   */
  getInventoryReport: (
    query: Readonly<ListInventoryReportQuery>,
  ) => Promise<ApiPage<InventoryReportRow>>
  /**
   * Asset & custody report — per-warehouse asset COUNTS by current status; the
   * client never infers lifecycle from other records.
   */
  getAssetReport: (query: Readonly<ListAssetReportQuery>) => Promise<ApiPage<AssetsReportRow>>
  /**
   * Count & adjustment report — per-warehouse counts and adjustment counters.
   * No client variance calculation.
   */
  getCountAdjustmentReport: (
    query: Readonly<ListCountAdjustmentReportQuery>,
  ) => Promise<ApiPage<CountAdjustmentsReportRow>>
  /**
   * Operational documents report — per-warehouse document counters grouped by
   * type and status.
   */
  getOperationalDocumentsReport: (
    query: Readonly<ListOperationalDocumentsReportQuery>,
  ) => Promise<ApiPage<DocumentsReportRow>>
  /**
   * Dashboard report — flat counters + the server timestamp. Singleton
   * response; the server owns every aggregation.
   */
  getDashboardReport: (query: Readonly<ListDashboardReportQuery>) => Promise<DashboardReport>
}

/**
 * Contract-backed reports transport. Every call passes only the parameters
 * declared by the corresponding controller; no aggregation, no client-side
 * sorting or grouping.
 *
 * Takes the shared `ApiTransport`, never an `AxiosInstance`: the envelope is
 * unwrapped once in `createAxiosTransport`
 * (`docs/feature-service-composition-standard.md`), which is why no method here
 * reads `.data`. List endpoints go through `requestPage` — the four list
 * endpoints answer with a bare `data` array plus a SIBLING `pagination` block,
 * which is exactly what it reads — and the singleton dashboard through
 * `request`. Failures are thrown by the transport already normalized, so this
 * service neither unwraps an error nor converts one into a successful result.
 */
export function createReportsService(transport: ApiTransport): ReportsService {
  return {
    async getInventoryReport(query) {
      return transport.requestPage<InventoryReportRow>({
        path: REPORTS_INVENTORY_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },

    async getAssetReport(query) {
      return transport.requestPage<AssetsReportRow>({
        path: REPORTS_ASSETS_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },

    async getCountAdjustmentReport(query) {
      return transport.requestPage<CountAdjustmentsReportRow>({
        path: REPORTS_COUNT_ADJUSTMENT_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },

    async getOperationalDocumentsReport(query) {
      return transport.requestPage<DocumentsReportRow>({
        path: REPORTS_DOCUMENTS_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },

    async getDashboardReport(query) {
      return transport.request<DashboardReport>({
        path: REPORTS_DASHBOARD_PATH,
        method: 'GET',
        // The dashboard controller binds `warehouseId` and NOTHING else
        // (`Web.Api/Controllers/Reports/GetDashboardReportController.cs:23`),
        // so this call carries no pagination and no invented filters.
        query: query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId },
      })
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Built at module
// evaluation, never as `{} as any` — that default is what made the first runtime
// list call throw. `createReportsService` is the test seam, so a test exercises
// the same code path against an isolated transport.
export const reportsService = createReportsService(apiTransport)
