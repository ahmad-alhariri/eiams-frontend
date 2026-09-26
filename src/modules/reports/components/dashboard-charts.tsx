import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { EmptyState } from '@/shared/feedback/empty-state'
import type { DashboardSeriesPoint } from '@/shared/types/generated/eiams-v1'

/**
 * EIAMS chart palette — keyed by data index.
 * Order: Mountain Teal (primary), Golden Wheat (secondary), Antique Sand,
 * Mountain Teal Light, Stone (neutral).
 * Per ui-design.md color palette.
 */
const CHART_COLORS = ['#428177', '#988561', '#b9a779', '#054239', '#3d3a3b'] as const

/**
 * Custom Recharts tooltip for movement trend.
 * RTL-aware, Arabic labels, formatted values.
 */
function MovementTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const value = payload[0]!.value
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-card">
      <p className="text-xs font-medium text-stone">{label}</p>
      <p className="text-sm font-semibold text-charcoal">
        {new Intl.NumberFormat('ar-EG').format(value)} حركة
      </p>
    </div>
  )
}

/**
 * Custom Recharts tooltip for asset distribution.
 * RTL-aware, Arabic labels, formatted values.
 */
function AssetTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const value = payload[0]!.value
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-card">
      <p className="text-xs font-medium text-stone">{label}</p>
      <p className="text-sm font-semibold text-charcoal">
        {new Intl.NumberFormat('ar-EG').format(value)} أصل
      </p>
    </div>
  )
}

interface DashboardChartsProps {
  /**
   * Daily movement trend series from `GET /reports/dashboard`.
   * Per D-RPT-02 §4: 1 point per day, label = Arabic date string.
   * Empty array renders `EmptyState`.
   */
  movementTrend: DashboardSeriesPoint[]
  /**
   * Asset status distribution series from `GET /reports/dashboard`.
   * Per D-RPT-02 §4: 1 point per asset derived status.
   * Empty array renders `EmptyState`.
   */
  assetStatusDistribution: DashboardSeriesPoint[]
}

const CHART_HEIGHT = 260

/**
 * Renders the two dashboard chart panels from `GET /reports/dashboard`.
 *
 * - **Left panel:** `movementTrend` as a responsive line chart.
 *   Per D-RPT-02 §4: the series is pre-bucketed by the server; the client
 *   renders labels verbatim without interpretation.
 *
 * - **Right panel:** `assetStatusDistribution` as a responsive donut/pie chart.
 *   Per D-RPT-02 §4: one slice per derived asset status.
 *
 * Empty arrays trigger `EmptyState` with an accessible Arabic message.
 * The `generatedAt` timestamp is rendered by the parent (KPI grid header)
 * and is not duplicated here.
 *
 * Accessibility: charts have `role="img"` + `aria-label` describing the chart type
 * and data summary. A visually hidden `<table>` equivalent is not included because
 * the charts are secondary to the primary KPI cards; screen-reader users rely on
 * the KPI card live-region for the primary numeric data.
 */
export function DashboardCharts({
  movementTrend,
  assetStatusDistribution,
}: DashboardChartsProps) {
  const hasTrend = movementTrend.length > 0
  const hasDistribution = assetStatusDistribution.length > 0
  const hasAnyChart = hasTrend || hasDistribution

  if (!hasAnyChart) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <EmptyState
          title="لا توجد بيانات حركات"
          description="لا توجد حركات مسجلة للفترة والمخزون المحددين."
          aria-label="لا توجد بيانات حركات للمخطط"
        />
        <EmptyState
          title="لا توجد بيانات أصول"
          description="لا توجد أصول المسح للمخطط."
          aria-label="لا توجد بيانات أصول للتوزيع"
        />
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Left: movement trend line chart ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 className="text-base font-semibold text-foreground">
              اتجاه الحركات اليومية
            </h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasTrend ? (
            <EmptyState
              title="لا توجد بيانات حركات"
              description="لا توجد حركات مسجلة للفترة المحددة."
              aria-label="لا توجد بيانات حركات للمخطط"
              className="min-h-52"
            />
          ) : (
            <div
              role="img"
              aria-label="مخطط خطي يوضح اتجاه الحركات اليومية للفترة المحددة"
            >
              <ResponsiveContainer height={CHART_HEIGHT} width="100%">
                <LineChart
                  data={movementTrend}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-row-divider, #e8ecf0)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--color-stone, #3d3a3b)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    // RTL: Arabic labels render right-to-left by default in ar-EG
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-stone, #3d3a3b)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat('ar-EG', { notation: 'compact' }).format(v)
                    }
                  />
                  <RechartsTooltip content={<MovementTooltip />} cursor={{ stroke: '#428177', strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS[0], strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: CHART_COLORS[0], strokeWidth: 0 }}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Right: asset status distribution pie chart ──────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 className="text-base font-semibold text-foreground">
              توزيع حالات الأصول
            </h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasDistribution ? (
            <EmptyState
              title="لا توجد بيانات أصول"
              description="لا توجد أصول المسح للتوزيع."
              aria-label="لا توجد بيانات أصول للتوزيع"
              className="min-h-52"
            />
          ) : (
            <div
              role="img"
              aria-label="مخطط دائري يوضح توزيع حالات الأصول الحالية"
            >
              <ResponsiveContainer height={CHART_HEIGHT} width="100%">
                <PieChart>
                  <Pie
                    data={assetStatusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="label"
                    label={({ name, percent }: PieLabelRenderProps) =>
                      `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}٪`
                    }
                    labelLine={{ stroke: 'var(--color-stone)', strokeWidth: 1 }}
                  >
                    {assetStatusDistribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length] as string}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<AssetTooltip />} />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-stone">{value}</span>
                    )}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
