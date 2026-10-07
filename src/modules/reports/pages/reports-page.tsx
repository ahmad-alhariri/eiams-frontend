import { useCallback, useMemo, useState } from 'react'

import { AssetReportTable } from '@/modules/reports/components/asset-report-table'
import { CountAdjustmentReportTable } from '@/modules/reports/components/count-adjustment-report-table'
import { DashboardPanel } from '@/modules/reports/components/dashboard-panel'
import { InventoryBalanceReportTable } from '@/modules/reports/components/inventory-balance-report-table'
import { OperationalDocumentsReportTable } from '@/modules/reports/components/operational-documents-report-table'
import { RecentActivityPanel } from '@/modules/reports/components/recent-activity-panel'
import { ReportsTabs, type ReportsTabDefinition } from '@/modules/reports/components/reports-tabs'
import { StockMovementReportTable } from '@/modules/reports/components/stock-movement-report-table'
import type { ReportsTabKey } from '@/modules/reports/types/reports.types'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'

const TAB_DEFINITIONS: ReadonlyArray<ReportsTabDefinition<ReportsTabKey>> = [
  {
    key: 'dashboard',
    labelAr: 'لوحة المؤشرات',
    content: <DashboardPanel />,
  },
  {
    key: 'recentActivity',
    labelAr: 'نشاط حديث',
    content: <RecentActivityPanel />,
  },
  {
    key: 'inventoryBalance',
    labelAr: 'أرصدة المخزون',
    content: <InventoryBalanceReportTable />,
  },
  {
    key: 'stockMovement',
    labelAr: 'حركات المخزون',
    content: <StockMovementReportTable />,
  },
  {
    key: 'assetCustody',
    labelAr: 'الأصول والتكليف',
    content: <AssetReportTable />,
  },
  {
    key: 'countAdjustment',
    labelAr: 'الجرد والتسويات',
    content: <CountAdjustmentReportTable />,
  },
  {
    key: 'operationalDocuments',
    labelAr: 'المستندات التشغيلية',
    content: <OperationalDocumentsReportTable />,
  },
]

const TAB_KEYS = TAB_DEFINITIONS.map((tab) => tab.key)

function isReportsTabKey(value: string): value is ReportsTabKey {
  return (TAB_KEYS as readonly string[]).includes(value)
}

/**
 * Reports page (e23 route). One page, seven server-owned projections under a
 * WAI-ARIA tabs surface. Route guard (`report.view`) is already enforced by
 * `RouteAccessGuard`; this page does not double-check the permission.
 *
 * Each panel renders its own `PageHeader` + `ContentCard` so filters,
 * titles, and descriptions stay co-located with the table that consumes them.
 *
 * The dashboard tab (e23-t02/t03) is unblocked by the ratified D-RPT-02
 * decision (`docs/dashboard-kpi-semantics-decision.md`). The export/print
 * surface (e23-t10) remains blocked on `opv2` and is documented in
 * `docs/reports-kpi-contract-decision.md` (D-RPT-01).
 */
function ReportsPageImpl() {
  const [activeTabKey, setActiveTabKey] = useState<ReportsTabKey>('dashboard')

  const handleTabChange = useCallback((next: string) => {
    if (isReportsTabKey(next)) {
      setActiveTabKey(next)
    }
  }, [])

  const tabs = useMemo(() => TAB_DEFINITIONS, [])

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="التقارير"
        subtitle="عروض قراءة فقط، تعتمد على الخادم ضمن نطاق العمل الحالي. لا يحتسب المتصفح أي مؤشرات أداء أو تجميعات."
      />

      <ContentCard
        title="عروض التقارير"
        description="اختر قسماً لعرض القراءة الموافق. الترتيب، التصفية، والترقيم تتم جميعها على الخادم."
      >
        <ReportsTabs<ReportsTabKey>
          tabs={tabs}
          activeKey={activeTabKey}
          onTabChange={handleTabChange}
        />
      </ContentCard>
    </div>
  )
}

export default function ReportsPage() {
  return <ReportsPageImpl />
}
