import { describe, expect, it, vi } from 'vitest'

import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiRequest, ApiTransport } from '@/shared/api/api-transport'
import type {
  ExportAcceptedPayload,
  ExportFilters,
  ExportJobStatus,
} from '@/modules/reports/services/reports-export.service'
import { createReportsExportService } from '@/modules/reports/services/reports-export.service'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * A recording `ApiTransport` double.
 *
 * The previous suite mocked `apiClient.get` and asserted on the axios call
 * tuple, so it verified the HTTP client's arguments, not the service contract.
 * This double records the `ApiRequest` the service builds — path, method and
 * query — which is the only thing the service owns, and answers with the payload
 * `transport.request` is documented to resolve to.
 *
 * A double rather than MSW because D-RPT-03 §7 says the export endpoints are not
 * in the contract yet, and the synchronous `200` branch answers with a rendered
 * file, which the shared transport cannot yet carry (see the KNOWN CONTRACT GAP
 * note in the service).
 */
interface RecordingTransport {
  readonly transport: ApiTransport
  readonly requests: readonly ApiRequest[]
}

function createRecordingTransport(respond: (request: ApiRequest) => unknown): RecordingTransport {
  const requests: ApiRequest[] = []

  return {
    requests,
    transport: {
      async request<TResponse>(request: ApiRequest): Promise<TResponse> {
        requests.push(request)
        // The stub has no type-level knowledge of TResponse; the single cast is
        // confined to this double and is the same one `createStubTransport` makes.
        return respond(request) as TResponse
      },
      async requestPage<TItem>(_request: Readonly<ApiRequest>): Promise<ApiPage<TItem>> {
        void _request
        throw new Error('reports-export.service never requests a page.')
      },
      async requestEmpty(_request: Readonly<ApiRequest>): Promise<void> {
        void _request
        throw new Error('reports-export.service never requests an empty body.')
      },
    },
  }
}

function transportFor(payload: ExportAcceptedPayload): RecordingTransport {
  return createRecordingTransport(() => payload)
}

function transportForStatus(status: ExportJobStatus): RecordingTransport {
  return createRecordingTransport(() => status)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reports-export.service', () => {
  describe('exportReport', () => {
    it('returns sync result with Blob for 200 response', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
      const { transport, requests } = transportFor(
        new Blob([pdfBytes], { type: 'application/pdf' }),
      )
      const service = createReportsExportService(transport)

      const result = await service.exportReport('inventory', 'pdf')

      expect(requests.at(-1)?.path).toBe('/reports/inventory/export')
      expect(requests.at(-1)?.method).toBe('GET')
      expect(result.type).toBe('sync')
      if (result.type === 'sync') {
        expect(result.blob).toBeInstanceOf(Blob)
        expect(result.blob.type).toBe('application/pdf')
        expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(pdfBytes)
        expect(result.filename).toMatch(/^EIAMS_inventory_.*\.pdf$/)
      }
    })

    it('returns async jobId for 202 response', async () => {
      const { transport } = transportFor({ jobId: 'test-job-123', status: 'processing' })
      const service = createReportsExportService(transport)

      const result = await service.exportReport('assets', 'pdf')

      expect(result.type).toBe('async')
      if (result.type === 'async') {
        expect(result.jobId).toBe('test-job-123')
      }
    })

    it('forwards only defined filter params', async () => {
      const { transport, requests } = transportFor(
        new Blob([new Uint8Array()], { type: 'application/pdf' }),
      )
      const service = createReportsExportService(transport)

      const filters: ExportFilters = {
        warehouseId: 'wh-001',
        // dateFrom/dateTo intentionally omitted
      }

      await service.exportReport('inventory', 'pdf', filters)

      const request = requests.at(-1)
      expect(request?.path).toBe('/reports/inventory/export')
      expect(request?.query).toMatchObject({
        format: 'pdf',
        warehouseId: 'wh-001',
      })
      // dateFrom/dateTo must NOT appear in the query
      expect(request?.query).not.toHaveProperty('dateFrom')
      expect(request?.query).not.toHaveProperty('dateTo')
      expect(request?.query).not.toHaveProperty('siteId')
    })

    it('uses correct path for movements export', async () => {
      const { transport, requests } = transportFor(
        new Blob([new Uint8Array()], { type: 'text/csv' }),
      )
      const service = createReportsExportService(transport)

      await service.exportReport('movements', 'csv')

      expect(requests.at(-1)?.path).toBe('/inventory/movements/export')
      expect(requests.at(-1)?.query).toMatchObject({ format: 'csv' })
    })
  })

  describe('pollExportJob', () => {
    it('returns ready status when server returns ready', async () => {
      const { transport, requests } = transportForStatus({
        jobId: 'job-abc',
        status: 'ready',
        downloadUrl: '/reports/exports/job-abc/download',
        expiresAt: '2026-09-26T00:00:00Z',
        recordCount: 142,
      })
      const service = createReportsExportService(transport)

      const result = await service.pollExportJob('job-abc')

      expect(requests.at(-1)?.path).toBe('/reports/exports/job-abc')
      expect(requests.at(-1)?.method).toBe('GET')
      expect(result.status).toBe('ready')
      expect(result).toMatchObject({
        jobId: 'job-abc',
        status: 'ready',
        downloadUrl: '/reports/exports/job-abc/download',
        recordCount: 142,
      })
    })

    it('encodes the job id into the polling path', async () => {
      const { transport, requests } = transportForStatus({
        jobId: 'job / دمشق',
        status: 'failed',
        error: 'Export failed.',
      })
      const service = createReportsExportService(transport)

      const result = await service.pollExportJob('job / دمشق')

      expect(requests.at(-1)?.path).toBe(`/reports/exports/${encodeURIComponent('job / دمشق')}`)
      expect(result).toEqual({ jobId: 'job / دمشق', status: 'failed', error: 'Export failed.' })
    })

    it('returns failed status when all poll attempts return processing', async () => {
      const { transport } = transportForStatus({
        jobId: 'job-slow',
        status: 'processing',
        progress: 50,
      })
      const service = createReportsExportService(transport)

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
