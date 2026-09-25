/**
 * Export report mutation hook (e23-t10).
 *
 * Wraps `reportsExportService.exportReport` in a TanStack Query mutation.
 * Handles both sync (200) and async (202) export flows, polls for async
 * jobs, and triggers browser download via the Blob URL pattern.
 *
 * Per D-RPT-03 §3: the server writes the audit log; the client cannot
 * forge export records. The hook does not write to any audit log.
 */

import { useMutation } from '@tanstack/react-query'

import {
  createReportsExportService,
  type ExportFilters,
  type ExportFormat,
  type ExportJobStatusReady,
  type ReportExportType,
} from '@/modules/reports/services/reports-export.service'
import { apiClient } from '@/shared/services/api.client'

// ---------------------------------------------------------------------------
// Download trigger
// ---------------------------------------------------------------------------

/**
 * Creates a temporary Blob URL, triggers a browser download, then revokes
 * the URL. The filename comes from the Content-Disposition header or falls
 * back to the provided default.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // Persian/Arabic numeral filename is fine; the server sends the name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke after a short delay to let the download start
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------------------------------------------------------------------------
// Service instance
// ---------------------------------------------------------------------------

const exportService = createReportsExportService(apiClient)

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseExportReportOptions {
  /** Which report to export (maps to D-RPT-03 §3.1 path) */
  reportType: ReportExportType
  /** Export format */
  format: ExportFormat
  /**
   * Filter/scope params forwarded to the export endpoint.
   * These MUST match the filters applied to the on-screen report.
   * The server enforces scope — the client cannot widen or bypass it.
   */
  filters?: ExportFilters
}

export interface UseExportReportResult {
  /**
   * Mutate to trigger an export.
   *
   * On success: browser download triggered automatically.
   * On error: error is set on the mutation; caller handles display.
   *
   * Loading state: `isPending === true` while exporting or polling.
   */
  exportReport: () => void
  isPending: boolean
  isError: boolean
  error: unknown
}

const MAX_POLL_ATTEMPTS = 150
const POLL_INTERVAL_MS = 2_000

/**
 * Export report mutation.
 *
 * Usage:
 * ```
 * const { exportReport, isPending } = useExportReport({
 *   reportType: 'inventory',
 *   format: 'pdf',
 *   filters: { dateFrom: '2026-01-01', dateTo: '2026-09-25' },
 * })
 * ```
 */
export function useExportReport(options: UseExportReportOptions) {
  const { reportType, format, filters } = options

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await exportService.exportReport(reportType, format, filters)

      if (result.type === 'sync') {
        // Small report — download immediately
        triggerDownload(result.blob, result.filename)
        return result
      }

      // Async job — poll until ready
      let status = await exportService.pollExportJob(result.jobId)
      let pollCount = 0

      while (status.status === 'processing' && pollCount < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        status = await exportService.pollExportJob(result.jobId)
        pollCount++
      }

      if (status.status === 'failed') {
        throw new Error(status.error ?? 'Export job failed.')
      }

      if (status.status !== 'ready') {
        throw new Error('Export timed out.')
      }

      // Fetch the actual file from the download URL
      const downloadResponse = await apiClient.get(status.downloadUrl, {
        responseType: 'blob',
        validateStatus: (s) => s < 500,
      })

      if (!downloadResponse.data) {
        throw new Error('No file returned from download URL.')
      }

      const readyStatus = status as ExportJobStatusReady
      const filename = `EIAMS_${reportType}_${filters?.dateFrom ?? 'start'}_${filters?.dateTo ?? 'end'}.${format}`
      void readyStatus.recordCount // exported for future telemetry; not shown to user
      triggerDownload(downloadResponse.data as Blob, filename)
      return { type: 'async', jobId: result.jobId, downloadUrl: status.downloadUrl }
    },
  })

  return {
    exportReport: () => mutation.mutate(),
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}
