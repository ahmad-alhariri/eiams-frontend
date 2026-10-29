import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createReportsService } from '@/modules/reports/services/reports.service'
import type {
  DashboardReport,
  InventoryReportRow,
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

// A real transport over a real Axios client, and the factory built on it — the
// same seam every migrated service test uses. The handlers below answer with the
// backend envelope (`data` array plus a SIBLING `pagination` block), which is
// what `requestPage` reads; the previous fixtures returned a bare `{items, meta}`
// body, the pre-D-INT-02 shape that no production transport would ever unwrap.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  return createReportsService(transport)
}

describe('reportsService', () => {
  describe('getInventoryReport', () => {
    it('forwards only documented query params and returns the typed balance page', async () => {
      const service = setupService()
      const summary: InventoryReportRow = {
        materialId: '00000000-0000-4000-8000-000000000024',
        materialCode: 'IT-HW-PC-001',
        materialNameAr: 'حاسوب مكتبي',
        totalQuantity: 10,
        warehouseCount: 1,
        lastUpdatedUtc: '2026-08-21T10:00:00.000Z',
      }
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([summary], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
        }),
      )

      const query: ListInventoryReportQuery = {
        page: 1,
        pageSize: 10,
        search: 'حاسوب',
        warehouseId: 'wh-1',
      }
      const page = await service.getInventoryReport(query)

      expect(page.items).toEqual([summary])
      // `ApiPage` is FLAT: the transport normalizes the wire `pagination`
      // block into `page`/`pageSize`/`totalItems`/`totalPages` siblings of
      // `items` — there is no `meta` envelope on the normalized page.
      expect(page.page).toBe(1)
      expect(page.pageSize).toBe(10)
      expect(page.totalItems).toBe(1)
      expect(page.totalPages).toBe(1)
      expect(captured.at(-1)).toMatchObject({
        page: '1',
        pageSize: '10',
        search: 'حاسوب',
        warehouseId: 'wh-1',
      })
    })

    it('omits undefined params to keep the wire request exactOptional-safe', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
        }),
      )

      const page = await service.getInventoryReport({ page: 1, pageSize: 10 })

      expect(page.items).toEqual([])
      expect(captured.at(-1)).not.toHaveProperty('search')
      expect(captured.at(-1)).not.toHaveProperty('warehouseId')
    })
  })

  describe('getAssetReport', () => {
    it('forwards status and warehouseId filters and returns the typed asset page', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/assets`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
        }),
      )

      const query: ListAssetReportQuery = {
        page: 1,
        pageSize: 10,
        status: 'InStock',
        warehouseId: 'wh-1',
      }
      const page = await service.getAssetReport(query)

      expect(page.items).toEqual([])
      expect(captured.at(-1)).toMatchObject({
        page: '1',
        pageSize: '10',
        status: 'InStock',
        warehouseId: 'wh-1',
      })
    })
  })

  describe('getCountAdjustmentReport', () => {
    it('forwards date and warehouse filters verbatim', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/count-adjustments`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
        }),
      )

      const query: ListCountAdjustmentReportQuery = {
        page: 1,
        pageSize: 10,
        warehouseId: 'wh-1',
        fromUtc: '2026-09-01T00:00:00.000Z',
        toUtc: '2026-09-30T00:00:00.000Z',
      }
      await service.getCountAdjustmentReport(query)

      expect(captured.at(-1)).toMatchObject({
        page: '1',
        pageSize: '10',
        warehouseId: 'wh-1',
        fromUtc: '2026-09-01T00:00:00.000Z',
        toUtc: '2026-09-30T00:00:00.000Z',
      })
    })
  })

  describe('getOperationalDocumentsReport', () => {
    it('forwards the contracted query parameters without inventing a documentType filter', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/documents`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
        }),
      )

      const query: ListOperationalDocumentsReportQuery = {
        page: 1,
        pageSize: 10,
        warehouseId: 'wh-1',
        fromUtc: '2026-09-01T00:00:00.000Z',
        toUtc: '2026-09-30T00:00:00.000Z',
      }
      await service.getOperationalDocumentsReport(query)

      const last = captured.at(-1) ?? {}
      expect(last).toMatchObject({
        page: '1',
        pageSize: '10',
        warehouseId: 'wh-1',
        fromUtc: '2026-09-01T00:00:00.000Z',
        toUtc: '2026-09-30T00:00:00.000Z',
      })
      expect(last).not.toHaveProperty('documentType')
    })
  })

  describe('getDashboardReport', () => {
    it('returns the server singleton payload unwrapped, forwarding only the bound filter', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      const dashboard: DashboardReport = {
        warehouseCount: 6,
        stockedMaterialCount: 7,
        totalOnHandQuantity: 531,
        assetCount: 15,
        activeCustodyCount: 6,
        openDocumentCount: 54,
        activeInventoryCountCount: 4,
        generatedAtUtc: '2026-10-27T04:14:19.3288988Z',
      }
      server.use(
        http.get(`${API_BASE_URL}/reports/dashboard`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okJson(dashboard)
        }),
      )

      const page = await service.getDashboardReport({ warehouseId: 'wh-1' })

      expect(page).toEqual(dashboard)
      // The dashboard controller binds `warehouseId` and nothing else
      // (`GetDashboardReportController.cs:23`) — the snapshot-era `siteId`,
      // `dateFrom` and `dateTo` were never bound and must not be sent.
      expect(captured.at(-1)).toMatchObject({ warehouseId: 'wh-1' })
      expect(captured.at(-1)).not.toHaveProperty('siteId')
      expect(captured.at(-1)).not.toHaveProperty('dateFrom')
      expect(captured.at(-1)).not.toHaveProperty('dateTo')
      expect(captured.at(-1)).not.toHaveProperty('page')
    })
  })
})
