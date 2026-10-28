import { describe, expect, it } from 'vitest'

import { toDashboardKpis } from '@/modules/reports/dashboard-kpis.model'
import type { DashboardReport } from '@/modules/reports/types/reports.types'

const FULL_REPORT: DashboardReport = {
  warehouseCount: 6,
  stockedMaterialCount: 7,
  totalOnHandQuantity: 531,
  assetCount: 15,
  activeCustodyCount: 6,
  openDocumentCount: 54,
  activeInventoryCountCount: 4,
  generatedAtUtc: '2026-10-27T04:14:19.3288988Z',
}

describe('toDashboardKpis', () => {
  it('labels every counter the server computed and invents no number', () => {
    const kpis = toDashboardKpis(FULL_REPORT)

    expect(kpis.map((kpi) => kpi.code)).toEqual([
      'warehouse_count',
      'stocked_material_count',
      'total_on_hand_quantity',
      'asset_count',
      'active_custody_count',
      'open_document_count',
      'active_inventory_count_count',
    ])
    expect(kpis.map((kpi) => kpi.value)).toEqual([6, 7, 531, 15, 6, 54, 4])
    expect(kpis.every((kpi) => kpi.labelAr.length > 0)).toBe(true)
  })

  it('omits a counter the server withheld instead of rendering it as zero', () => {
    const kpis = toDashboardKpis({ ...FULL_REPORT, assetCount: null, activeCustodyCount: null })

    expect(kpis.map((kpi) => kpi.code)).not.toContain('asset_count')
    expect(kpis.map((kpi) => kpi.code)).not.toContain('active_custody_count')
    expect(kpis.map((kpi) => kpi.value)).not.toContain(0)
  })
})
