import type { MaterialStatus } from '@/modules/catalog/types/catalog.types'
import { Badge } from '@/shared/ui/badge'
import { StatusBadge } from '@/shared/feedback/status-badge'

type MaterialStatusBadgeProps = {
  status: MaterialStatus
}

/**
 * Status badge for a MATERIAL, which is the only catalog entity whose status
 * space has a third value.
 *
 * `StatusBadge`'s `record` entity covers `Active`/`Inactive` — the statuses a
 * domain, category, family or unit can hold. `Archived` exists on Material
 * ONLY (see `MaterialStatusOrdinal`, where `2` is its wire ordinal) and is
 * TERMINAL server-side: there is no route that leaves it, so the badge states
 * the fact rather than offering the shared entity a status it does not model.
 */
function MaterialStatusBadge({ status }: MaterialStatusBadgeProps) {
  if (status !== 'Archived') {
    return <StatusBadge entity="record" status={status} />
  }

  return (
    <Badge variant="destructive" data-status="Archived">
      مؤرشف نهائياً
    </Badge>
  )
}

export { MaterialStatusBadge, type MaterialStatusBadgeProps }
