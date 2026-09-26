import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { get: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import type { ExportFilters } from './reports-export.service'
import { createReportsExportService } from './reports-export.service'

const mockedGet = vi.mocked(apiClient.get)

beforeEach(() => {
  mockedGet.mockReset()
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeArrayBuffer(data: string): ArrayBuffer {
  return new TextEncoder().encode(data).buffer as ArrayBuffer
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reports-export.service', () => {
  describe('exportReport', () => {
    it('returns sync result with Blob for 200 response', async () => {
      const service = createReportsExportService(apiClient)
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF

      mockedGet.mockResolvedValue({
        data: pdfBytes,
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })

      const result = await service.exportReport('inventory', 'pdf')

      expect(result.type).toBe('sync')
      if (result.type === 'sync') {
        expect(result.blob).toBeInstanceOf(Blob)
        expect(result.blob.type).toBe('application/pdf')
        expect(result.filename).toMatch(/^EIAMS_inventory_.*\.pdf$/)
      }
    })

    it('returns async jobId for 202 response', async () => {
      const service = createReportsExportService(apiClient)

      mockedGet.mockResolvedValue({
        data: makeArrayBuffer(JSON.stringify({ jobId: 'test-job-123' })),
        status: 202,
        headers: {},
      })

      const result = await service.exportReport('assets', 'pdf')

      expect(result.type).toBe('async')
      if (result.type === 'async') {
        expect(result.jobId).toBe('test-job-123')
      }
    })

    it('forwards only defined filter params', async () => {
      const service = createReportsExportService(apiClient)

      mockedGet.mockResolvedValue({
        data: new Uint8Array(),
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })

      const filters: ExportFilters = {
        warehouseId: 'wh-001',
        // dateFrom/dateTo intentionally omitted
      }

      await service.exportReport('inventory', 'pdf', filters)

      expect(mockedGet).toHaveBeenCalledWith(
        '/reports/inventory/export',
        expect.objectContaining({
          params: expect.objectContaining({
            format: 'pdf',
            warehouseId: 'wh-001',
          }),
        }),
      )
      // dateFrom/dateTo must NOT appear in params
      const callArgs = mockedGet.mock.calls[0]![1] as { params: Record<string, unknown> }
      expect(callArgs.params).not.toHaveProperty('dateFrom')
      expect(callArgs.params).not.toHaveProperty('dateTo')
      expect(callArgs.params).not.toHaveProperty('siteId')
    })

    it('uses correct path for movements export', async () => {
      const service = createReportsExportService(apiClient)

      mockedGet.mockResolvedValue({
        data: new Uint8Array(),
        status: 200,
        headers: { 'content-type': 'text/csv' },
      })

      await service.exportReport('movements', 'csv')

      expect(mockedGet).toHaveBeenCalledWith(
        '/inventory/movements/export',
        expect.any(Object),
      )
    })
  })

  describe('pollExportJob', () => {
    it('returns ready status when server returns ready', async () => {
      const service = createReportsExportService(apiClient)

      mockedGet.mockResolvedValue({
        data: {
          jobId: 'job-abc',
          status: 'ready',
          downloadUrl: '/reports/exports/job-abc/download',
          expiresAt: '2026-09-26T00:00:00Z',
          recordCount: 142,
        },
        status: 200,
        headers: {},
      })

      const result = await service.pollExportJob('job-abc')

      expect(result.status).toBe('ready')
      expect(result).toMatchObject({
        jobId: 'job-abc',
        status: 'ready',
        downloadUrl: '/reports/exports/job-abc/download',
        recordCount: 142,
      })
    })

    it('returns failed status when all poll attempts return processing', async () => {
      const service = createReportsExportService(apiClient)

      mockedGet.mockResolvedValue({
        data: { jobId: 'job-slow', status: 'processing', progress: 50 },
        status: 200,
        headers: {},
      })

      vi.useFakeTimers()

      const pollPromise = service.pollExportJob('job-slow')

      // Advance past MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS (150 * 2000ms)
      await vi.advanceTimersByTimeAsync(310_000)

      const result = await pollPromise
      expect(result.status).toBe('failed')

      vi.useRealTimers()
    })
  })
})
