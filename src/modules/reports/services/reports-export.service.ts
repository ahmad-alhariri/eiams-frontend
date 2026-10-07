/**
 * Reports export service (e23-t10).
 *
 * Implements D-RPT-03 §3: `GET /reports/{reportType}/export`.
 * Handles both synchronous (200 → Blob) and asynchronous (202 → poll → Blob)
 * responses. The client never constructs the export file.
 *
 * Export is scope-bound; the caller MUST forward the same filter/scope
 * parameters that are applied to the on-screen report. The server enforces
 * scope. The client cannot forge export audit records.
 *
 * Backend endpoints required (not yet implemented per D-RPT-03 §8):
 *   GET /reports/{inventory|assets|count-adjustments|documents}/export
 *   GET /inventory/movements/export
 *   GET /reports/exports/{jobId}
 */

import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'csv'

export type ReportExportType = 'inventory' | 'assets' | 'count-adjustments' | 'movements' | 'documents'

/** Sync response — small report ready immediately */
export interface ExportSyncResponse {
  type: 'sync'
  blob: Blob
  filename: string
}

/** Async response — large report requires polling */
export interface ExportAsyncResponse {
  type: 'async'
  jobId: string
}

export type ExportResponse = ExportSyncResponse | ExportAsyncResponse

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Maps report type to the export path per D-RPT-03 §3.1 */
const EXPORT_PATHS: Record<ReportExportType, string> = {
  inventory: '/reports/inventory/export',
  assets: '/reports/assets/export',
  'count-adjustments': '/reports/count-adjustments/export',
  movements: '/inventory/movements/export',
  documents: '/reports/documents/export',
} as const

const EXPORT_JOB_PATH = '/reports/exports'

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface ReportsExportService {
  /**
   * Trigger an export and return either a sync Blob or async job info.
   *
   * The caller is responsible for handling both paths:
   * - `type: 'sync'` → immediately trigger browser download with the Blob
   * - `type: 'async'` → poll `getExportJobStatus` until `type: 'ready'`,
   *   then download from `downloadUrl`
   *
   * @param reportType  Which report to export
   * @param format      'pdf' or 'csv'
   * @param filters     dateFrom, dateTo, warehouseId, siteId (all optional;
   *                    server defaults apply when omitted)
   */
  exportReport: (
    reportType: ReportExportType,
    format: ExportFormat,
    filters?: ExportFilters,
  ) => Promise<ExportResponse>

  /**
   * Poll an async export job until it is 'ready' or 'failed'.
   *
   * @param jobId  UUID returned from an async export response
   * @returns      The completed ExportJobStatus
   */
  pollExportJob: (jobId: string) => Promise<ExportJobStatus>
}

export interface ExportFilters {
  dateFrom?: string // ISO 8601 date
  dateTo?: string   // ISO 8601 date
  warehouseId?: string
  siteId?: string
}

// ---------------------------------------------------------------------------
// Export job status
// ---------------------------------------------------------------------------

export type ExportJobStatusProcessing = {
  jobId: string
  status: 'processing'
  progress?: number
}

export type ExportJobStatusReady = {
  jobId: string
  status: 'ready'
  downloadUrl: string
  expiresAt: string // ISO 8601
  recordCount: number
}

export type ExportJobStatusFailed = {
  jobId: string
  status: 'failed'
  error: string
}

export type ExportJobStatus =
  | ExportJobStatusProcessing
  | ExportJobStatusReady
  | ExportJobStatusFailed

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_ATTEMPTS = 150 // 5 minutes max

/**
 * Builds the Content-Disposition filename from D-RPT-03 §3.3.
 * Format: EIAMS_{reportType}_{dateFrom}_{dateTo}.{ext}
 */
function buildFilename(reportType: ReportExportType, format: ExportFormat, dateFrom?: string, dateTo?: string): string {
  const ext = format === 'pdf' ? 'pdf' : 'csv'
  const from = dateFrom ?? 'start'
  const to = dateTo ?? 'end'
  return `EIAMS_${reportType}_${from}_${to}.${ext}`
}

export function createReportsExportService(client: AxiosInstance): ReportsExportService {
  async function exportReport(
    reportType: ReportExportType,
    format: ExportFormat,
    filters?: ExportFilters,
  ): Promise<ExportResponse> {
    const path = EXPORT_PATHS[reportType]

    const response = await client.get(path, {
      params: {
        format,
        ...(filters?.dateFrom !== undefined ? { dateFrom: filters.dateFrom } : {}),
        ...(filters?.dateTo !== undefined ? { dateTo: filters.dateTo } : {}),
        ...(filters?.warehouseId !== undefined ? { warehouseId: filters.warehouseId } : {}),
        ...(filters?.siteId !== undefined ? { siteId: filters.siteId } : {}),
      },
      // Accept any response — binary for 200, JSON for 202
      responseType: 'arraybuffer',
      // Allow 4xx to surface as resolved promise (caller handles via isError)
      validateStatus: (status) => status < 500,
    })

    if (response.status === 202) {
      // Async job — parse the jobId from JSON body
      const data = JSON.parse(new TextDecoder().decode(response.data)) as { jobId: string }
      return { type: 'async', jobId: data.jobId }
    }

    // 200 — sync Blob ready
    const contentType = response.headers['content-type'] as string
    const blob = new Blob([response.data], { type: contentType })
    const filename = buildFilename(
      reportType,
      format,
      filters?.dateFrom,
      filters?.dateTo,
    )
    return { type: 'sync', blob, filename }
  }

  async function getExportJobStatus(jobId: string): Promise<ExportJobStatus> {
    const response = await client.get<ExportJobStatus>(
      `${EXPORT_JOB_PATH}/${jobId}`,
      { validateStatus: (status) => status < 500 },
    )
    return response.data
  }

  /**
   * Poll until the export job is ready or failed.
   * Returns the final ExportJobStatus (never 'processing').
   */
  async function pollExportJob(jobId: string): Promise<ExportJobStatus> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const status = await getExportJobStatus(jobId)
      if (status.status === 'ready' || status.status === 'failed') {
        return status
      }
      // Wait before next poll
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    // Exceeded max attempts
    return { jobId, status: 'failed', error: 'Export timed out after maximum polling attempts.' }
  }

  return {
    exportReport,
    pollExportJob,
  }
}

export const reportsExportService = createReportsExportService(apiClient)
