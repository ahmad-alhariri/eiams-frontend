import { StatusBadge } from '@/shared/feedback/status-badge'
import { cn } from '@/shared/utils/class-names'

import type { WarehouseInitializationStatus } from '@/modules/warehouse/types/warehouse.api-types'

/**
 * Read-only badge showing a warehouse's per-D-OPEN-02 initialization state
 * (PRD §6.2, §6.4, §6.10). Four wire strings — NotInitialized, Initialized,
 * ZeroStock, Reversed — each render an Arabic chip so the user can tell at a
 * glance whether the warehouse is ready for Opening.
 *
 * The Arabic labels and the colour family both come from the shared
 * `StatusBadge` registry under the `warehouse-initialization` entity. This
 * component owns no tone map of its own: `docs/design-tokens.md` forbids a
 * feature component from maintaining its own status-color switch statement,
 * and a private palette here is how the four literal Tailwind colours drifted
 * in. The cut-off date is module-specific presentation, so it stays here.
 */
export function WarehouseInitializationBadge({
  status,
  asOfDate,
  className,
}: {
  status: WarehouseInitializationStatus | undefined | null
  asOfDate?: string | null | undefined
  className?: string
}): React.ReactElement | null {
  // The status string is Arabic-labelled at the registry, so i18n is
  // intentionally not consulted here and the badge reads identically on every
  // surface. An absent or unknown status renders nothing rather than guessing.
  if (status === undefined || status === null) {
    return null
  }
  return (
    <span
      data-slot="warehouse-initialization-badge"
      data-testid="warehouse-initialization-badge"
      data-status={status}
      className={cn('inline-flex items-center gap-1 text-xs font-medium', className)}
      dir="rtl"
    >
      <StatusBadge entity="warehouse-initialization" status={status} />
      {asOfDate !== undefined && asOfDate !== null ? (
        <span className="opacity-70">· {asOfDate}</span>
      ) : null}
    </span>
  )
}
