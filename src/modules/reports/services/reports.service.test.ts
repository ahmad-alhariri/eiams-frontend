import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createReportsService } from '@/modules/reports/services/reports.service'
import type {
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'
import { createInventoryBalance } from '@/test/msw/factories'
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
      const balance = createInventoryBalance()
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okPageJson([balance], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
        }),
      )

      const query: ListInventoryReportQuery = {
        pageIndex: 0,
        pageSize: 10,
        search: 'حاسوب',
        warehouseId: 'wh-1',
      }
      const page = await service.getInventoryReport(query)

      expect(page.items).toEqual([balance])
      expect(page.meta).toEqual({ pageIndex: 0, pageSize: 10, totalItems: 1, totalPages: 1 })
      expect(captured.at(-1)).toMatchObject({
        pageIndex: '0',
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

      const page = await service.getInventoryReport({ pageIndex: 0, pageSize: 10 })

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
        pageIndex: 0,
        pageSize: 10,
        status: 'InStock',
        warehouseId: 'wh-1',
      }
      const page = await service.getAssetReport(query)

      expect(page.items).toEqual([])
      expect(captured.at(-1)).toMatchObject({
        pageIndex: '0',
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
        pageIndex: 0,
        pageSize: 10,
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      }
      await service.getCountAdjustmentReport(query)

      expect(captured.at(-1)).toMatchObject({
        pageIndex: '0',
        pageSize: '10',
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
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
        pageIndex: 0,
        pageSize: 10,
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      }
      await service.getOperationalDocumentsReport(query)

      const last = captured.at(-1) ?? {}
      expect(last).toMatchObject({
        pageIndex: '0',
        pageSize: '10',
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      })
      expect(last).not.toHaveProperty('documentType')
    })
  })

  describe('getDashboardReport', () => {
    it('returns the server singleton payload unwrapped, forwarding all four filters', async () => {
      const service = setupService()
      const captured: Record<string, string>[] = []
      const dashboard = { kpis: [], trends: [], distributions: [] }
      server.use(
        http.get(`${API_BASE_URL}/reports/dashboard`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return okJson(dashboard)
        }),
      )

      const page = await service.getDashboardReport({
        siteId: 'site-1',
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      })

      expect(page).toEqual(dashboard)
      expect(captured.at(-1)).toMatchObject({
        siteId: 'site-1',
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      })
    })
  })
})
