import { memo } from 'react'

import { cn } from '@/shared/utils/class-names'
import type { KpiValue } from '@/shared/types/generated/eiams-v1'

/**
 * Trend arrow — SVG arrow indicating direction of `changePercent`.
 * Per D-RPT-02 §6: ▲ Teal = positive, ▼ Cherry = negative, — Stone = zero.
 */
function TrendArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') {
    return (
      <svg
        aria-hidden="true"
        className="size-3 text-mountain-teal"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        viewBox="0 0 16 16"
      >
        <path d="M8 3L13 8M8 3L3 8M8 3V13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (direction === 'down') {
    return (
      <svg
        aria-hidden="true"
        className="size-3 text-black-cherry"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        viewBox="0 0 16 16"
      >
        <path d="M8 13L3 8M8 13L13 8M8 13V3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg
      aria-hidden="true"
      className="size-3 text-stone"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 16 16"
    >
      <path d="M3 8H13" strokeLinecap="round" />
    </svg>
  )
}

interface KpiCardProps {
  /** `KpiValue` from `GET /reports/dashboard` (D-RPT-02 ratified). */
  kpi: KpiValue
  /** Accessible label for the trend, e.g. "زيادة ٣٫٢٪". Defaults to changePercent. */
  trendAriaLabel?: string
  className?: string
}

const PERCENT_FIXED = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
}).format

function KpiCard({ kpi, trendAriaLabel, className }: KpiCardProps) {
  const { code, labelAr, value, unitAr, changePercent } = kpi

  const change = changePercent ?? null
  const trendDirection: 'up' | 'down' | 'flat' =
    change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'

  const changeLabel =
    change !== null ? `${PERCENT_FIXED(change)}٪` : '—'

  return (
    <article
      aria-label={`${labelAr}: ${value} ${unitAr ?? ''}`}
      className={cn(
        // Per ui-design.md §5.8: white card, radius-xl, shadow-card, padding 20px 24px
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card',
        className,
      )}
    >
      {/* Icon circle — decorative per ui-design.md §5.8 */}
      <div
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ivory"
      >
        {/* Metric icon — matches the KPI domain by code convention */}
        <KpiIcon code={code} />
      </div>

      {/* Value row */}
      <div className="flex flex-col gap-1">
        <p className="text-3xl font-bold leading-none text-charcoal" aria-live="polite">
          {new Intl.NumberFormat('ar-EG').format(value)}
        </p>
        <p className="text-xs font-medium text-stone">{unitAr ?? labelAr}</p>
      </div>

      {/* Label + trend row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-stone">{labelAr}</p>

        {change !== null && (
          <div
            className="flex items-center gap-0.5"
            aria-label={trendAriaLabel ?? `${changeLabel} مقارنة بالفترة السابقة`}
          >
            <TrendArrow direction={trendDirection} />
            <span className="text-xs font-semibold tabular-nums">{changeLabel}</span>
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * Maps KPI code prefix/suffix to an appropriate Lucide icon.
 * Icons are decorative (aria-hidden) — they do not carry semantic meaning.
 */
function KpiIcon({ code }: { code: string }) {
  // Dynamic import would break tree-shaking; we use a static map with known codes.
  // All icons are 16px, stroke-1.5, stone color — matching the design system.
  switch (code) {
    // Inventory
    case 'total_balance_items':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    case 'total_stock_quantity':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h18v18H3zM9 9h6m-3-3v6" />
        </svg>
      )
    case 'low_stock_items':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      )
    // Assets
    case 'active_assets':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v10M15 3v10M5 20h14M7 20V10m10 10V10" />
        </svg>
      )
    // Documents
    case 'documents_posted':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'pending_documents':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    // Movements
    case 'movements_this_period':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      )
    // Custody
    case 'open_custodies':
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return (
        <svg aria-hidden className="size-4 text-stone" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
  }
}

const KpiCardMemo = memo(KpiCard) as React.MemoExoticComponent<typeof KpiCard> & { displayName: string }
KpiCardMemo.displayName = 'KpiCard'

export { KpiCardMemo as KpiCard }
export type { KpiCardProps }
