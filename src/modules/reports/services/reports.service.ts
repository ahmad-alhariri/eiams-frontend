import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
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
 * Conditional spread builders for each reports endpoint. Mirrors
 * `adjustment.service.ts` §`toListParams`: only declared parameters are
 * forwarded, never `undefined`, so `exactOptionalPropertyTypes` stays clean
 * and the wire request never leaks empty keys.
 */
function toInventoryReportParams(query: Readonly<ListInventoryReportQuery>) {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toAssetReportParams(query: Readonly<ListAssetReportQuery>) {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

function toCountAdjustmentReportParams(query: Readonly<ListCountAdjustmentReportQuery>) {
  return {
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
  }
}

function toOperationalDocumentsReportParams(query: Readonly<ListOperationalDocumentsReportQuery>) {
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
function toDashboardReportParams(query: Readonly<ListDashboardReportQuery>) {
  return {
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
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
  getDashboardReport: (
    query: Readonly<ListDashboardReportQuery>,
  ) => Promise<DashboardReport>
}

/**
 * Contract-backed reports transport (e23-t05/t07/t08/t09). Every call passes
 * only the parameters declared by the corresponding operation; no aggregation,
 * no client-side sorting or grouping.
 */
export function createReportsService(client: AxiosInstance): ReportsService {
  return {
    async getInventoryReport(query) {
      const response = await client.get<InventoryBalancePage>(REPORTS_INVENTORY_PATH, {
        params: toInventoryReportParams(query),
      })
      return response.data
    },

    async getAssetReport(query) {
      const response = await client.get<AssetPage>(REPORTS_ASSETS_PATH, {
        params: toAssetReportParams(query),
      })
      return response.data
    },

    async getCountAdjustmentReport(query) {
      const response = await client.get<InventoryAdjustmentPage>(REPORTS_COUNT_ADJUSTMENT_PATH, {
        params: toCountAdjustmentReportParams(query),
      })
      return response.data
    },

    async getOperationalDocumentsReport(query) {
      const response = await client.get<WarehouseDocumentPage>(REPORTS_DOCUMENTS_PATH, {
        params: toOperationalDocumentsReportParams(query),
      })
      return response.data
    },

    async getDashboardReport(query) {
      const response = await client.get<DashboardReport>(REPORTS_DASHBOARD_PATH, {
        params: toDashboardReportParams(query),
      })
      return response.data
    },
  }
}

export const reportsService = createReportsService(apiClient)
