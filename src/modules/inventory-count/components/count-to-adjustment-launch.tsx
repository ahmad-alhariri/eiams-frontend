import { Link } from 'react-router'

import type { InventoryCount } from '@/shared/types/generated/eiams-v1'

import { useRoutePermission } from '@/modules/auth/hooks/use-permission'
import { ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { isCountAdjustmentEligible } from '@/modules/inventory-count/utils/count-review'

/**
 * Count-to-adjustment launch (e21-t03, PRD §12.6 step 7): once a count
 * session reaches its review states, an eligible manager launches the
 * CountVariance adjustment flow from here. The link carries the count
 * context (`countId`, `purpose=CountVariance`, `warehouseId`) as query
 * params consumed by the new-adjustment form (e21-t04) — D-ADJ-01 requires
 * a CountVariance adjustment to reference its originating session.
 *
 * Keepers never see the CTA: creating adjustments is manager-owned
 * (D-ADJ-01), using the same permission gate as the destination route.
 */
export function CountToAdjustmentLaunch({ count }: { count: InventoryCount }) {
  const canCreate = useRoutePermission('adjustmentNew')

  if (!canCreate || !isCountAdjustmentEligible(count.status) || count.varianceCount === 0) {
    return null
  }

  const launchTo =
    `${ROUTE_PATHS.adjustmentNew}` +
    `?countId=${encodeURIComponent(count.countId)}` +
    `&purpose=CountVariance` +
    `&warehouseId=${encodeURIComponent(count.warehouse.id)}`

  return (
    <ContentCard
      title="إنشاء سند تسوية"
      description="فروقات هذه الجلسة لا تُعدّل الأرصدة بنفسها؛ تُرحَّل عبر سند تسوية مرتبط بالجلسة يحمل أسباب الفروقات."
    >
      <Link
        className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        data-slot="count-to-adjustment-launch"
        to={launchTo}
      >
        إنشاء سند تسوية لفروقات الجلسة
      </Link>
    </ContentCard>
  )
}
