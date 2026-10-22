import { CUSTODY_STATUS_LABELS_AR } from '@/modules/custody/custody-status-labels'
import type { CustodyStatus } from '@/modules/custody/types/custody.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { Badge } from '@/shared/ui/badge'

/**
 * Badge for the subject-dependent custody status.
 *
 * The shared status registry knows the two ASSET-subject states (`Active` /
 * `Closed`); the live API also serves the TrackedUnit and MaterialQuantity
 * states on the same field, so those are rendered with the shared `Badge`
 * primitive and this module's own Arabic label.
 */
export function CustodyStatusBadge({ status }: { status: CustodyStatus }) {
  if (status === 'Active' || status === 'Closed') {
    return <StatusBadge entity="custody" status={status} label={CUSTODY_STATUS_LABELS_AR[status]} />
  }

  return (
    <Badge variant="outline" data-status={status}>
      {CUSTODY_STATUS_LABELS_AR[status]}
    </Badge>
  )
}
