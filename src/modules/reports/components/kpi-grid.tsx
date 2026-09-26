import { useCallback } from 'react'

import { Card } from '@/shared/ui/card'
import { KpiCard } from '@/shared/ui/kpi-card'
import type { KpiValue } from '@/shared/types/generated/eiams-v1'

/** Per ui-design.md §5.8: 4-column grid at desktop, 2-column at tablet, 1-column at mobile. */
const KPI_GRID_COLS = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

interface KpiGridProps {
  /** Array of `KpiValue` from `GET /reports/dashboard` (D-RPT-02 ratified). */
  kpis: KpiValue[]
  /** Shown as ARIA-live region while loading or errored. */
  'aria-label'?: string
}

/**
 * Renders the ratified KPI vocabulary as a responsive grid of KPI cards.
 *
 * - **Period KPIs** (codes with `_this_period` or `_posted`): shown in first row,
 *   grouped to visually anchor the period context.
 * - **Snapshot KPIs** (codes without a period suffix): shown in second row.
 * - Empty `kpis` array renders an accessible empty-message card (not silent failure).
 * - Per D-RPT-02 §5: server owns null/zero treatment; this component only handles
 *   the empty-array case which is a genuine "no data for this scope" state.
 *
 * Layout: 4-col desktop → 2-col tablet → 1-col mobile (ui-design.md §5.8).
 */
export function KpiGrid({ kpis, 'aria-label': ariaLabel = 'لوحة مؤشرات الأداء' }: KpiGridProps) {
  // Split into period KPIs (anchor context) and snapshot KPIs (status) per D-RPT-02 §3.
  // Codes ending with `_this_period` or `_posted` are period-bound.
  const periodKpis = kpis.filter((k) => k.code.includes('_this_period') || k.code.includes('_posted'))
  const snapshotKpis = kpis.filter((k) => !periodKpis.includes(k))

  const renderCard = useCallback(
    (kpi: KpiValue) => (
      <KpiCard
        key={kpi.code}
        kpi={kpi}
        trendAriaLabel={formatTrendAriaLabel(kpi)}
        className="h-full"
      />
    ),
    [],
  )

  if (kpis.length === 0) {
    return (
      <Card
        aria-label={ariaLabel}
        className="flex min-h-40 items-center justify-center p-8"
      >
        <p className="text-sm text-muted-foreground" role="status">
          لا توجد بيانات مؤشرات لهذه الفترة والمخزون المحددين
        </p>
      </Card>
    )
  }

  return (
    <section aria-label={ariaLabel} aria-live="polite">
      {/* Period KPIs — context-setting row */}
      {periodKpis.length > 0 && (
        <div className="mb-4">
          <h2 className="sr-only">مؤشرات الفترة المحددة</h2>
          <div className={`grid gap-4 ${KPI_GRID_COLS}`}>
            {periodKpis.map(renderCard)}
          </div>
        </div>
      )}

      {/* Snapshot KPIs — current-state row */}
      {snapshotKpis.length > 0 && (
        <div className={`grid gap-4 ${KPI_GRID_COLS}`}>
          {snapshotKpis.map(renderCard)}
        </div>
      )}
    </section>
  )
}

/**
 * Formats a human-readable ARIA label for the trend badge.
 * Uses Arabic numeral formatting per the project RTL conventions.
 */
function formatTrendAriaLabel(kpi: KpiValue): string {
  const { changePercent, labelAr } = kpi
  if (changePercent === null || changePercent === undefined) {
    return `تغيّر ${labelAr}: غير متاح`
  }
  if (changePercent === 0) {
    return `تغيّر ${labelAr}: بدون تغيير`
  }
  const sign = changePercent > 0 ? 'زيادة' : 'انخفاض'
  const absValue = new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 1,
  }).format(Math.abs(changePercent))
  return `تغيّر ${labelAr}: ${sign} ${absValue}٪ مقارنة بالفترة السابقة`
}
