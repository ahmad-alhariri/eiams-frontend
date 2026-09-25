import { useMemo } from 'react'

import { Skeleton } from '@/shared/ui/skeleton'
import { useDashboardReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import { KpiGrid } from '@/modules/reports/components/kpi-grid'
import { DashboardCharts } from '@/modules/reports/components/dashboard-charts'

/**
 * Dashboard panel — KPI cards + trend/distribution charts (e23-t02/t03).
 * Renders the singleton `GET /reports/dashboard` response.
 *
 * Data flow:
 *  `useDashboardReportQuery` → `DashboardReport { kpis, movementTrend, assetStatusDistribution }`
 *    → `KpiGrid` (KPI cards)
 *    → `DashboardCharts` (line + pie)
 *
 * Loading/error/empty states are handled at the panel level so KPI cards
 * and charts share the same loading skeleton and never render in partial states.
 *
 * Per D-RPT-02: server owns aggregation, date-boundary, series bucket width,
 * and null/zero treatment. The client renders verbatim labels without interpretation.
 */
export function DashboardPanel() {
  const { data, isLoading, isError, error } = useDashboardReportQuery({})

  const generatedAt = data?.generatedAt
  const kpis = (data?.kpis ?? []).slice()
  const movementTrend = (data?.movementTrend ?? []).slice()
  const assetStatusDistribution = (data?.assetStatusDistribution ?? []).slice()

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
      {/* KPI cards — primary dashboard surface */}
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

      {/* Charts — secondary dashboard surface (only render when data is available) */}
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : !isError && data ? (
        <DashboardCharts
          movementTrend={movementTrend}
          assetStatusDistribution={assetStatusDistribution}
        />
      ) : null}

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
