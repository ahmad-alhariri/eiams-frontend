import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { reportsService } from '@/modules/reports/services/reports.service'
import type {
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

afterEach(() => {
  // Each test runs on a fresh handler state.
})

describe('reportsService', () => {
  describe('getInventoryReport', () => {
    it('forwards only documented query params and returns the typed balance page', async () => {
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return HttpResponse.json({
            items: [],
            meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
          })
        }),
      )

      const query: ListInventoryReportQuery = {
        pageIndex: 0,
        pageSize: 10,
        search: 'حاسوب',
        warehouseId: 'wh-1',
      }
      const page = await reportsService.getInventoryReport(query)

      expect(page.items).toEqual([])
      expect(captured.at(-1)).toMatchObject({
        pageIndex: '0',
        pageSize: '10',
        search: 'حاسوب',
        warehouseId: 'wh-1',
      })
    })

    it('omits undefined params to keep the wire request exactOptional-safe', async () => {
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return HttpResponse.json({
            items: [],
            meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
          })
        }),
      )

      await reportsService.getInventoryReport({ pageIndex: 0, pageSize: 10 })

      expect(captured.at(-1)).not.toHaveProperty('search')
      expect(captured.at(-1)).not.toHaveProperty('warehouseId')
    })
  })

  describe('getAssetReport', () => {
    it('forwards status and warehouseId filters and returns the typed asset page', async () => {
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/assets`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return HttpResponse.json({
            items: [],
            meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
          })
        }),
      )

      const query: ListAssetReportQuery = {
        pageIndex: 0,
        pageSize: 10,
        status: 'InStock',
        warehouseId: 'wh-1',
      }
      await reportsService.getAssetReport(query)

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
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/count-adjustments`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return HttpResponse.json({
            items: [],
            meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
          })
        }),
      )

      const query: ListCountAdjustmentReportQuery = {
        pageIndex: 0,
        pageSize: 10,
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      }
      await reportsService.getCountAdjustmentReport(query)

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
      const captured: Record<string, string>[] = []
      server.use(
        http.get(`${API_BASE_URL}/reports/documents`, ({ request }) => {
          captured.push(Object.fromEntries(new URL(request.url).searchParams))
          return HttpResponse.json({
            items: [],
            meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
          })
        }),
      )

      const query: ListOperationalDocumentsReportQuery = {
        pageIndex: 0,
        pageSize: 10,
        warehouseId: 'wh-1',
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T00:00:00.000Z',
      }
      await reportsService.getOperationalDocumentsReport(query)

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
})
