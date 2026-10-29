import { useMemo } from 'react'

import { Skeleton } from '@/shared/ui/skeleton'
import { useDashboardReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import { KpiGrid } from '@/modules/reports/components/kpi-grid'
import { toDashboardKpis } from '@/modules/reports/dashboard-kpis.model'

/**
 * Dashboard panel — the KPI surface of `GET /reports/dashboard` (e23-t02/t03).
 *
 * Data flow:
 *  `useDashboardReportQuery` → `DashboardReport` (flat counters)
 *    → `toDashboardKpis` (labels + units only)
 *    → `KpiGrid` (KPI cards)
 *
 * The live response is a SINGLETON of flat counters
 * (`Application/Reports/Dashboard/DashboardReportResponse.cs:3-11`): it carries
 * NO kpi list and NO series, so there is nothing to chart. The frozen snapshot
 * described a dashboard of KPI codes with trend and distribution series — that
 * shape is not on the wire, and inventing the series in the browser would be
 * the client computing aggregates the server owns (D-RPT-02).
 *
 * Loading/error/empty states are handled at the panel level so the KPI cards
 * never render in a partial state.
 */
export function DashboardPanel() {
  const { data, isLoading, isError, error } = useDashboardReportQuery({})

  const generatedAt = data?.generatedAtUtc
  const kpis = useMemo(() => (data === undefined ? [] : toDashboardKpis(data)), [data])

  const formattedGeneratedAt = useMemo(() => {
    if (!generatedAt) return null
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(generatedAt))
    } catch {
      return null
    }
  }, [generatedAt])

  return (
    <div className="flex flex-col gap-6">
      {/* KPI cards — the dashboard's only surface on the live contract */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorCard
          message={
            error instanceof Error
              ? error.message
              : 'فشل تحميل بيانات لوحة المؤشرات. يرجى المحاولة لاحقاً.'
          }
        />
      ) : (
        <KpiGrid kpis={kpis} />
      )}

      {/* Data provenance — server timestamp */}
      {generatedAt && (
        <p
          className="text-center text-xs text-muted-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          آخر تحديث: {formattedGeneratedAt}
        </p>
      )}
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="flex min-h-40 items-center justify-center rounded-xl border border-destructive/40 bg-destructive/5 p-8"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm text-destructive">{message}</p>
    </div>
  )
}
