import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { formatNumber } from '@/shared/utils/format'
import type { InventoryLowStockStateCode } from '@/modules/inventory/types/inventory.api-types'

/**
 * Keyed by the numeric wire code (0=Low … 3=Disabled) because the Minimal API
 * path does not apply the MVC `JsonStringEnumConverter`; the canonical name is
 * kept for the `data-low-stock-state` DOM attribute.
 */
const LOW_STOCK_META = {
  0: { name: 'Low', label: 'منخفض', variant: 'critical' },
  1: { name: 'Sufficient', label: 'الرصيد كافٍ', variant: 'success' },
  2: { name: 'NotConfigured', label: 'حدّ التنبيه غير محدد', variant: 'outline' },
  3: { name: 'Disabled', label: 'تنبيه الانخفاض معطّل', variant: 'ghost' },
} as const satisfies Record<
  InventoryLowStockStateCode,
  { name: string; label: string; variant: Exclude<BadgeProps['variant'], null | undefined> }
>

export interface InventoryLowStockBadgeProps {
  state: InventoryLowStockStateCode
  /**
   * Server-computed threshold from `InventoryBalance.lowStock`. It is optional
   * so detail consumers that currently receive only a state stay compatible.
   */
  thresholdQuantity?: number | null
}

function hasConfiguredThreshold(
  state: InventoryLowStockStateCode,
  thresholdQuantity: number | null | undefined,
): thresholdQuantity is number {
  return (
    (state === 0 || state === 1) &&
    thresholdQuantity !== null &&
    thresholdQuantity !== undefined
  )
}

/**
 * Pure presentation of the server-computed low-stock projection. The browser
 * deliberately does not compare balance quantities with thresholds here.
 */
export function InventoryLowStockBadge({ state, thresholdQuantity }: InventoryLowStockBadgeProps) {
  const meta = LOW_STOCK_META[state]
  const configured = hasConfiguredThreshold(state, thresholdQuantity)
  const formattedThreshold = configured
    ? formatNumber(thresholdQuantity, { maxFractionDigits: 3 })
    : null

  return (
    <span
      data-slot="inventory-low-stock"
      data-low-stock-state={meta.name}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <Badge variant={meta.variant}>{meta.label}</Badge>
      {configured ? (
        <span
          data-slot="inventory-low-stock-threshold"
          aria-label={`حدّ التنبيه: ${formattedThreshold}`}
          className="text-xs text-muted-foreground"
        >
          حدّ التنبيه: <span dir="ltr">{formattedThreshold}</span>
        </span>
      ) : null}
    </span>
  )
}
