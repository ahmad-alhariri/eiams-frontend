/**
 * Reports export service (e23-t10).
 *
 * Implements D-RPT-03 §3: `GET /reports/{reportType}/export`.
 * Handles both synchronous (200 → rendered file) and asynchronous
 * (202 → poll → `downloadUrl`) responses. The client never constructs the
 * export file.
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

import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'csv'

export type ReportExportType =
  'inventory' | 'assets' | 'count-adjustments' | 'movements' | 'documents'

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

/**
 * The D-RPT-03 §3.2 body of a `202 Accepted` export trigger: the job the server
 * queued, not the file.
 */
export interface ExportJobAccepted {
  readonly jobId: string
  readonly status: 'processing'
}

/**
 * Payload of `GET /reports/{reportType}/export` as the shared transport hands it
 * back: the rendered file for a synchronous `200`, or the queued-job body for an
 * asynchronous `202`. The two are distinguished by the payload's own shape, so
 * this service reads no response header and no status code.
 *
 * KNOWN CONTRACT GAP, not verified against a running backend. D-RPT-03 §7 says
 * these endpoints are still to be added to the OpenAPI document, and
 * `ApiTransport` today exposes no binary response mode: `request` resolves to
 * `envelope.data`, and a `200 application/pdf` body has no envelope to unwrap.
 * The synchronous branch therefore only carries a real file once the transport
 * grows a blob-capable method (or the endpoint answers with a JSON descriptor
 * naming a download URL, as the `202`/`ready` branches already do). Nothing
 * else in the file depends on that gap.
 */
export type ExportAcceptedPayload = Blob | ExportJobAccepted

/** The wire query shape every `ApiRequest` accepts; see `reports.service.ts`. */
type ExportQueryParams = Readonly<Record<string, string | number | boolean | undefined>>

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Maps report type to the export path per D-RPT-03 §3.1.
 *
 * Declared without `satisfies keyof paths`: the generated `paths` map predates
 * the export contract (D-RPT-03 §7), so nothing here could be checked against
 * it. Recording them as plain constants keeps the routes visible and reviewable
 * instead of claiming a contract check that does not exist.
 */
const EXPORT_PATHS: Record<ReportExportType, string> = {
  inventory: '/reports/inventory/export',
  assets: '/reports/assets/export',
  'count-adjustments': '/reports/count-adjustments/export',
  movements: '/inventory/movements/export',
  documents: '/reports/documents/export',
} as const

const EXPORT_JOB_PATH = '/reports/exports'

function exportJobPath(jobId: string): string {
  return `${EXPORT_JOB_PATH}/${encodeURIComponent(jobId)}`
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface ReportsExportService {
  /**
   * Trigger an export and return either a sync Blob or async job info.
   *
   * The caller is responsible for handling both paths:
   * - `type: 'sync'` → immediately trigger browser download with the Blob
   * - `type: 'async'` → poll `pollExportJob` until `type: 'ready'`,
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
  dateTo?: string // ISO 8601 date
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
  ExportJobStatusProcessing | ExportJobStatusReady | ExportJobStatusFailed

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_ATTEMPTS = 150 // 5 minutes max

/**
 * Builds the Content-Disposition filename from D-RPT-03 §3.3.
 * Format: EIAMS_{reportType}_{dateFrom}_{dateTo}.{ext}
 */
function buildFilename(
  reportType: ReportExportType,
  format: ExportFormat,
  dateFrom?: string,
  dateTo?: string,
): string {
  const ext = format === 'pdf' ? 'pdf' : 'csv'
  const from = dateFrom ?? 'start'
  const to = dateTo ?? 'end'
  return `EIAMS_${reportType}_${from}_${to}.${ext}`
}

/**
 * Only the filters the caller actually set are forwarded, so the export request
 * carries exactly the scope the on-screen report was built from (D-RPT-03 §2.1).
 * `format` is always present; it is the only required query parameter (§3.1).
 */
function toExportQueryParams(format: ExportFormat, filters?: ExportFilters): ExportQueryParams {
  return {
    format,
    ...(filters?.dateFrom !== undefined ? { dateFrom: filters.dateFrom } : {}),
    ...(filters?.dateTo !== undefined ? { dateTo: filters.dateTo } : {}),
    ...(filters?.warehouseId !== undefined ? { warehouseId: filters.warehouseId } : {}),
    ...(filters?.siteId !== undefined ? { siteId: filters.siteId } : {}),
  }
}

function isExportJobAccepted(payload: ExportAcceptedPayload): payload is ExportJobAccepted {
  return !(payload instanceof Blob)
}

/**
 * Contract-only export transport. Takes the shared `ApiTransport`, never an
 * `AxiosInstance` (`docs/feature-service-composition-standard.md`): no method
 * below calls an HTTP client or reads `.data`, because the transport resolves to
 * the payload and throws server failures already normalized.
 *
 * That last point is a deliberate behaviour change from the Axios version, which
 * passed `validateStatus: (status) => status < 500` and therefore RESOLVED a
 * `403` as if it were a file. A rejected export is now a thrown failure for the
 * hook to present (`normalizeApiError`) rather than a zero-byte download.
 */
export function createReportsExportService(transport: ApiTransport): ReportsExportService {
  async function exportReport(
    reportType: ReportExportType,
    format: ExportFormat,
    filters?: ExportFilters,
  ): Promise<ExportResponse> {
    const payload = await transport.request<ExportAcceptedPayload>({
      path: EXPORT_PATHS[reportType],
      method: 'GET',
      query: toExportQueryParams(format, filters),
    })

    if (isExportJobAccepted(payload)) {
      return { type: 'async', jobId: payload.jobId }
    }

    // Synchronous export — the server-rendered file, passed through untouched.
    return {
      type: 'sync',
      blob: payload,
      filename: buildFilename(reportType, format, filters?.dateFrom, filters?.dateTo),
    }
  }

  async function getExportJobStatus(jobId: string): Promise<ExportJobStatus> {
    const response = await transport.request<ExportJobStatus>({
      path: exportJobPath(jobId),
      method: 'GET',
    })
    return response
  }

  /**
   * Poll until the export job is ready or failed.
   * Returns the final ExportJobStatus (never 'processing').
   */
  async function pollExportJob(jobId: string): Promise<ExportJobStatus> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const status = await getExportJobStatus(jobId)
      if (status.status === 'ready' || status.status === 'failed') {
        return status
      }
      // Wait before next poll
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

// Eager singleton over the application's single transport (9uuf). Built at module
// evaluation, never as `{} as any`. `createReportsExportService` is the test
// seam.
export const reportsExportService = createReportsExportService(apiTransport)
