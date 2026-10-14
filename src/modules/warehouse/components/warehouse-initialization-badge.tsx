import type { WarehouseInitializationStatus } from '@/modules/warehouse/types/warehouse.api-types'
import { cn } from '@/shared/utils/class-names'

/**
 * Read-only badge showing a warehouse's per-D-OPEN-02 initialization state
 * (PRD §6.2, §6.4, §6.10). Three wire strings — NotInitialized, Initialized,
 * ZeroStock, Reversed — each render an Arabic chip with a stable color so
 * the user can tell at a glance whether the warehouse is ready for Opening.
 */
const LABELS_AR: Readonly<Record<WarehouseInitializationStatus, string>> = {
  NotInitialized: 'غير مهيأ',
  Initialized: 'مهيأ (بحركة)',
  ZeroStock: 'مهيأ (بدون حركة)',
  Reversed: 'معكوس',
}

const TONES: Readonly<Record<WarehouseInitializationStatus, string>> = {
  NotInitialized: 'border-amber-300 bg-amber-50 text-amber-900',
  Initialized: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  ZeroStock: 'border-sky-300 bg-sky-50 text-sky-900',
  Reversed: 'border-rose-300 bg-rose-50 text-rose-900',
}

export function WarehouseInitializationBadge({
  status,
  asOfDate,
  className,
}: {
  status: WarehouseInitializationStatus | undefined | null
  asOfDate?: string | null | undefined
  className?: string
}): React.ReactElement | null {
  // The labels are Arabic-locked at the wire; i18n is intentionally
  // not consulted here so the badge is identical across every surface.
  if (status === undefined || status === null) {
    return null
  }
  return (
    <span
      data-slot="warehouse-initialization-badge"
      data-testid="warehouse-initialization-badge"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        TONES[status],
        className,
      )}
      dir="rtl"
    >
      <span>{LABELS_AR[status]}</span>
      {asOfDate !== undefined && asOfDate !== null ? (
        <span className="opacity-70">· {asOfDate}</span>
      ) : null}
    </span>
  )
}
