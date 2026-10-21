import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useCreateAdjustmentMutation } from '@/modules/inventory-count/hooks/use-count-queries'
import type { InventoryCount } from '@/modules/inventory-count/types/inventory-count.types'
import { isCountAdjustmentEligible } from '@/modules/inventory-count/utils/count-review'
import { useRoutePermission } from '@/modules/auth/hooks/use-permission'
import { ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'

/**
 * Count-to-adjustment launch (F8). The count's own `settlement` projection
 * drives the whole flow — no client-side recomputation of differences:
 *
 * - `NotRequired` → the count has no differences; nothing to settle.
 * - `Pending` without `adjustmentId` → the CTA creates the adjustment draft
 *   with `POST /{countId}/adjustment` (no body) and answers `{ id }`; the
 *   operator is taken to that draft in the adjustment module.
 * - `Pending` with `adjustmentId` → the draft already exists; the CTA links to
 *   it directly instead of creating a second one.
 * - `Settled` → nothing (the linked adjustment already posted).
 *
 * Keepers never see the CTA: creating adjustments is manager-owned
 * (D-ADJ-01), using the same permission gate as the destination route.
 */
export function CountToAdjustmentLaunch({ count }: { count: InventoryCount }) {
  const canCreate = useRoutePermission('adjustmentNew')
  const navigate = useNavigate()
  const createMutation = useCreateAdjustmentMutation(count.id)
  const [createError, setCreateError] = useState<string | null>(null)

  const settlement = count.settlement
  if (!canCreate || !isCountAdjustmentEligible(count.status)) {
    return null
  }
  // Defensive `settlement` guard: until the backend serves the frozen detail
  // projection there is nothing settlement-driven to render, never a crash.
  if (settlement === undefined || settlement.status === 'NotRequired' || settlement.status === 'Settled') {
    return null
  }

  const launchedPath =
    settlement.adjustmentId !== null
      ? `${ROUTE_PATHS.adjustments}/${encodeURIComponent(settlement.adjustmentId)}`
      : undefined

  const handleCreate = async () => {
    setCreateError(null)
    try {
      const draft = await createMutation.mutateAsync()
      toast.success({ title: 'أُنشئت مسودة سند التسوية.' })
      void navigate(`${ROUTE_PATHS.adjustments}/${encodeURIComponent(draft.id)}`)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setCreateError(
        `${apiError.titleAr}${apiError.detailAr === null ? '' : ` — ${apiError.detailAr}`}`,
      )
    }
  }

  return (
    <ContentCard
      title="إنشاء سند تسوية"
      description="فروقات هذه الجلسة لا تُعدّل الأرصدة بنفسها؛ تُرحَّل عبر سند تسوية مرتبط بالجلسة يحمل أسباب الفروقات."
    >
      <div className="grid gap-3">
        {launchedPath !== undefined ? (
          <Link
            className="inline-flex w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            data-slot="count-to-adjustment-launch"
            to={launchedPath}
          >
            الانتقال إلى مسودة سند التسوية
          </Link>
        ) : (
          <Button
            type="button"
            className="w-fit"
            data-slot="count-to-adjustment-launch"
            onClick={() => void handleCreate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء مسودة سند تسوية لفروقات الجلسة'}
          </Button>
        )}
        {createError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {createError}
          </p>
        ) : null}
      </div>
    </ContentCard>
  )
}
