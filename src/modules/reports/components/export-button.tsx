/**
 * Export button (e23-t10, D-RPT-03 §3).
 *
 * Rendered structure while the backend export endpoints are pending: this
 * component now returns null after the permission gate.
 *
 * Why: the live backend serves no `/reports/something/export` or
 * `/reports/exports/jobId` paths today (verified against
 * `http://localhost:5000/swagger/v1/swagger.json` on 2026-10-20 — the only
 * GET routes under `/reports/something` are
 * `/reports/assets`, `/reports/count-adjustments`, `/reports/dashboard`,
 * `/reports/documents` and `/reports/inventory`, and no path name mentions
 * the word export). Hiding the action at every callsite means the UI never
 * offers a download the server cannot fulfil. The client code in
 * `reports-export.service.ts` and `use-export-report.ts` is left in place so
 * it can be wired back in once the backend ships the five export endpoints.
 *
 * Removing the `ExportButton` import (and the icon set + `useState` from
 * this file) would touch every report table, which is out of scope here; the
 * gates below keep the component a no-op without dragging a re-render of the
 * export hook into every page render.
 */

import { usePermission } from '@/modules/auth/hooks/use-permission'
import type { UseExportReportOptions } from '@/modules/reports/hooks/use-export-report'
import type { PermissionCode } from '@/config/permissions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'csv'

interface ExportButtonProps {
  /** The report type for the export service */
  reportType: UseExportReportOptions['reportType']
  /** Permission code required to export this report */
  requiredPermission: PermissionCode
  /**
   * Filters forwarded to the export endpoint. MUST match the filters applied
   * to the on-screen report (D-RPT-03 §2.1).
   */
  filters?: UseExportReportOptions['filters']
  /** Button label; defaults to Arabic */
  label?: string
  /** Additional CSS classes for the primary button */
  className?: string
}

const DEFAULT_LABEL = 'تصدير التقرير'

/**
 * Hidden while the backend export feature request is open. See file header.
 *
 * Kept as a real component (instead of deleting the file) so the report
 * tables' `<ExportButton ... />` calls still type-check and so the same
 * permission gate (`requiredPermission`) survives the eventual un-hide.
 * Removing the callsite now would touch five report components for no reason.
 */
export function ExportButton(props: ExportButtonProps) {
  // Suppress unused-parameter lint without breaking the existing call sites.
  void props
  void DEFAULT_LABEL

  const { has } = usePermission()

  if (!has(props.requiredPermission)) {
    return null
  }
  return null
}
