import type { KpiValue } from '@/shared/ui/kpi-card'

import type { DashboardReport } from '@/modules/reports/types/reports.types'

/**
 * Maps the LIVE dashboard counters onto the KPI card vocabulary.
 *
 * The wire carries FLAT counters — `DashboardReportResponse` has no kpi list
 * and no series (`Application/Reports/Dashboard/DashboardReportResponse.cs:3-11`)
 * — so the client attaches the Arabic label and the unit to each counter and
 * nothing else. It computes nothing: every number on the screen is the
 * server's own.
 *
 * A counter the server WITHHOLDS arrives as `null` (the handler nulls it out
 * when the caller may not see it) and is OMITTED rather than rendered as a
 * zero. D-RPT-02 §4.1 is explicit: the frontend "must not substitute a
 * missing KPI with a zero or default", and "must not synthesize a missing
 * KPI".
 */
export function toDashboardKpis(report: DashboardReport): KpiValue[] {
  const counters: ReadonlyArray<{
    readonly code: string
    readonly labelAr: string
    readonly unitAr: string
    readonly value: number | null
  }> = [
    {
      code: 'warehouse_count',
      labelAr: 'عدد المستودعات',
      unitAr: 'مستودع',
      value: report.warehouseCount,
    },
    {
      code: 'stocked_material_count',
      labelAr: 'المواد المخزّنة',
      unitAr: 'مادة',
      value: report.stockedMaterialCount,
    },
    {
      code: 'total_on_hand_quantity',
      labelAr: 'إجمالي الكمية المتوفرة',
      unitAr: 'وحدة',
      value: report.totalOnHandQuantity,
    },
    {
      code: 'asset_count',
      labelAr: 'عدد الأصول',
      unitAr: 'أصل',
      value: report.assetCount,
    },
    {
      code: 'active_custody_count',
      labelAr: 'التكليفات النشطة',
      unitAr: 'تكليف',
      value: report.activeCustodyCount,
    },
    {
      code: 'open_document_count',
      labelAr: 'المستندات المفتوحة',
      unitAr: 'مستند',
      value: report.openDocumentCount,
    },
    {
      code: 'active_inventory_count_count',
      labelAr: 'عمليات الجرد النشطة',
      unitAr: 'جرد',
      value: report.activeInventoryCountCount,
    },
  ]

  return counters
    .filter(
      (counter): counter is typeof counter & { readonly value: number } => counter.value !== null,
    )
    .map((counter) => ({
      code: counter.code,
      labelAr: counter.labelAr,
      unitAr: counter.unitAr,
      value: counter.value,
    }))
}
