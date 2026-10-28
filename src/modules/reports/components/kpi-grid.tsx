import { useCallback } from 'react'

import { Card } from '@/shared/ui/card'
import { KpiCard } from '@/shared/ui/kpi-card'
import type { KpiValue } from '@/shared/ui/kpi-card'

/** Per ui-design.md §5.8: 4-column grid at desktop, 2-column at tablet, 1-column at mobile. */
const KPI_GRID_COLS = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

interface KpiGridProps {
  /** The metrics to render — the dashboard's counters, labelled by the caller. */
  kpis: readonly KpiValue[]
  /** Shown as ARIA-live region while loading or errored. */
  'aria-label'?: string
}

/**
 * Renders a set of KPI cards as a responsive grid.
 *
 * An empty set renders an accessible empty-message card (not silent failure).
 * Per D-RPT-02 §5 the server owns null/zero treatment; this component only
 * handles the empty case, which is a genuine "no data for this scope" state.
 *
 * Layout: 4-col desktop → 2-col tablet → 1-col mobile (ui-design.md §5.8).
 */
export function KpiGrid({ kpis, 'aria-label': ariaLabel = 'لوحة مؤشرات الأداء' }: KpiGridProps) {
  const renderCard = useCallback(
    (kpi: KpiValue) => <KpiCard key={kpi.code} kpi={kpi} className="h-full" />,
    [],
  )

  if (kpis.length === 0) {
    return (
      <Card aria-label={ariaLabel} className="flex min-h-40 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground" role="status">
          لا توجد بيانات مؤشرات لهذه الفترة والمخزون المحددين
        </p>
      </Card>
    )
  }

  return (
    <section aria-label={ariaLabel} aria-live="polite">
      <div className={`grid gap-4 ${KPI_GRID_COLS}`}>{kpis.map(renderCard)}</div>
    </section>
  )
}
