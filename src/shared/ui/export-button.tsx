/**
 * Export button with format dropdown (e23-t10, D-RPT-03 §3).
 *
 * Renders a split button: the primary button triggers the default format
 * download; a chevron opens a popover to switch between PDF and CSV.
 *
 * Permission-gated per D-RPT-03 §2.2. Hidden when the caller lacks the
 * required permission.
 *
 * The export endpoint is called when the user triggers a download. The server
 * handles scope enforcement, audit logging, and PDF rendering. The client
 * never constructs the export file.
 *
 * Per D-RPT-03 §6.2: hidden when formal export is unavailable (backend
 * returns 501 Not Implemented). The button is always rendered; the mutation
 * error state reflects backend readiness.
 */

import { useState } from 'react'

import { IconDownload, IconFileTypePdf, IconFileTypeCsv, IconLoader2, IconChevronDown } from '@tabler/icons-react'

import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent } from '@/shared/ui/popover'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import {
  useExportReport,
  type UseExportReportOptions,
} from '@/modules/reports/hooks/use-export-report'
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
   * Filters forwarded to the export endpoint.
   * MUST match the filters applied to the on-screen report (D-RPT-03 §2.1).
   */
  filters?: UseExportReportOptions['filters']
  /** Button label; defaults to Arabic */
  label?: string
  /** Additional CSS classes for the primary button */
  className?: string
}

// ---------------------------------------------------------------------------
// Format options
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS: Array<{
  format: ExportFormat
  primaryLabel: string
  menuLabel: string
  icon: React.ReactNode
}> = [
  {
    format: 'pdf',
    primaryLabel: 'تصدير PDF',
    menuLabel: 'PDF',
    icon: <IconFileTypePdf className="size-4 text-destructive" aria-hidden />,
  },
  {
    format: 'csv',
    primaryLabel: 'تصدير CSV',
    menuLabel: 'CSV',
    icon: <IconFileTypeCsv className="size-4 text-[var(--chart-2,theme.colors.forest))]" aria-hidden />,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_LABEL = 'تصدير التقرير'

/**
 * Export button with PDF/CSV format popover.
 *
 * Hidden when `requiredPermission` is not held (D-RPT-03 §2.2).
 *
 * Usage:
 * ```
 * <ExportButton
 *   reportType="inventory"
 *   requiredPermission="inventory.view"
 *   filters={{ warehouseId }}
 * />
 * ```
 */
export function ExportButton({
  reportType,
  requiredPermission,
  filters,
  label = DEFAULT_LABEL,
  className,
}: ExportButtonProps) {
  const { has } = usePermission()
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf')
  const [open, setOpen] = useState(false)

  // Fix: pass `filters` as typed or undefined (not `{ dateFrom: string | undefined }`)
  const resolvedFilters = (() => {
    if (filters === undefined) return undefined
    const { dateFrom, dateTo, warehouseId, siteId } = filters
    return {
      ...(dateFrom !== undefined ? { dateFrom } : {}),
      ...(dateTo !== undefined ? { dateTo } : {}),
      ...(warehouseId !== undefined ? { warehouseId } : {}),
      ...(siteId !== undefined ? { siteId } : {}),
    }
  })()

  const { exportReport, isPending, isError } = useExportReport({
    reportType,
    format: selectedFormat,
    ...(resolvedFilters !== undefined ? { filters: resolvedFilters } : {}),
  })

  // Hidden when no permission (per D-RPT-03 §2.2)
  if (!has(requiredPermission)) {
    return null
  }

  function handleFormatSelect(format: ExportFormat) {
    setSelectedFormat(format)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex">
        {/* Primary download button */}
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={isPending}
          onClick={() => exportReport()}
          className={className}
        >
          {isPending ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <IconDownload className="size-4" aria-hidden />
          )}
        </Button>

        {/* Format selector — opens popover on click */}
        <Button
          variant="outline"
          size="icon"
          disabled={isPending}
          onClick={() => setOpen((v) => !v)}
          aria-label={`${label} — تنسيقات`}
          aria-expanded={open}
          aria-haspopup="menu"
          className="rounded-s-none"
        >
          <IconChevronDown className="size-4" aria-hidden />
        </Button>

        <PopoverContent
          align="end"
          className="flex min-w-32 flex-col gap-0.5 p-1.5"
          sideOffset={4}
        >
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {label}
          </div>

          {isError && (
            <div className="px-2 py-1.5 text-xs text-destructive" role="alert">
              فشل التصدير. الخادم لم يُنفِّذ هذا النوع بعد.
            </div>
          )}

          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              onClick={() => handleFormatSelect(option.format)}
              disabled={isPending}
              aria-current={selectedFormat === option.format ? 'true' : undefined}
              className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option.icon}
              <span className="flex-1 text-start">{option.menuLabel}</span>
              {selectedFormat === option.format && isPending && (
                <IconLoader2 className="size-3.5 animate-spin" aria-hidden />
              )}
            </button>
          ))}
        </PopoverContent>
      </div>
    </Popover>
  )
}
