import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { formatNumber } from '@/shared/utils/format'
import type { InventoryLowStockState } from '@/shared/types/generated/eiams-v1'

const LOW_STOCK_META = {
  Low: { label: 'منخفض', variant: 'critical' },
  Sufficient: { label: 'الرصيد كافٍ', variant: 'success' },
  NotConfigured: { label: 'حدّ التنبيه غير محدد', variant: 'outline' },
  Disabled: { label: 'تنبيه الانخفاض معطّل', variant: 'ghost' },
} as const satisfies Record<
  InventoryLowStockState,
  { label: string; variant: Exclude<BadgeProps['variant'], null | undefined> }
>

export interface InventoryLowStockBadgeProps {
  state: InventoryLowStockState
  /**
   * Server-computed threshold from `InventoryBalance.lowStock`. It is optional
   * so detail consumers that currently receive only a state stay compatible.
   */
  thresholdQuantity?: number | null
}

function hasConfiguredThreshold(
  state: InventoryLowStockState,
  thresholdQuantity: number | null | undefined,
): thresholdQuantity is number {
  return (
    (state === 'Low' || state === 'Sufficient') &&
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
      data-low-stock-state={state}
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
