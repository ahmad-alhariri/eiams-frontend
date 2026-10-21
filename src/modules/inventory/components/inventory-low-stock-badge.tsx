import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { formatNumber } from '@/shared/utils/format'
import type { InventoryLowStockStateCode } from '@/modules/inventory/types/inventory.api-types'

/**
 * Keyed by the numeric wire code (0=Low … 3=Disabled) because the Minimal API
 * path does not apply the MVC `JsonStringEnumConverter`; the canonical name is
 * kept for the `data-low-stock-state` DOM attribute.
 */
type LowStockMeta = {
  readonly name: string
  readonly label: string
  readonly variant: Exclude<BadgeProps['variant'], null | undefined>
}

const LOW_STOCK_META = {
  0: { name: 'Low', label: 'منخفض', variant: 'critical' },
  1: { name: 'Sufficient', label: 'الرصيد كافٍ', variant: 'success' },
  2: { name: 'NotConfigured', label: 'حدّ التنبيه غير محدد', variant: 'outline' },
  3: { name: 'Disabled', label: 'تنبيه الانخفاض معطّل', variant: 'ghost' },
} as const satisfies Record<InventoryLowStockStateCode, LowStockMeta>

const UNKNOWN_LOW_STOCK_META: LowStockMeta = {
  name: 'Unknown',
  label: 'حالة غير معروفة',
  variant: 'outline',
}

/**
 * The response is unvalidated JSON, so a backend enum addition can deliver a
 * code outside 0..3; render a neutral badge instead of throwing in the table.
 */
const LOW_STOCK_META_BY_CODE: Readonly<Partial<Record<number, LowStockMeta>>> = LOW_STOCK_META

export interface InventoryLowStockBadgeProps {
  /** Numeric wire code; kept as `number` because the JSON is not validated. */
  state: number
  /**
   * Server-computed threshold from `InventoryBalance.lowStock`. It is optional
   * so detail consumers that currently receive only a state stay compatible.
   */
  thresholdQuantity?: number | null
}

function hasConfiguredThreshold(
  state: number,
  thresholdQuantity: number | null | undefined,
): thresholdQuantity is number {
  return (
    (state === 0 || state === 1) && thresholdQuantity !== null && thresholdQuantity !== undefined
  )
}

/**
 * Pure presentation of the server-computed low-stock projection. The browser
 * deliberately does not compare balance quantities with thresholds here.
 */
export function InventoryLowStockBadge({ state, thresholdQuantity }: InventoryLowStockBadgeProps) {
  const meta = LOW_STOCK_META_BY_CODE[state] ?? UNKNOWN_LOW_STOCK_META
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
