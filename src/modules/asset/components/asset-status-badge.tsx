import { ASSET_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import type { AssetCurrentStatus } from '@/modules/asset/types/asset.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { Badge } from '@/shared/ui/badge'

/**
 * Badge for the five LIVE asset statuses.
 *
 * The shared status registry knows the four SETTLED states; the live API also
 * serves `Unknown` (the server's own "I cannot classify this asset" answer).
 * That one is rendered with the shared `Badge` primitive and the module's own
 * Arabic label, so every status shows a real Arabic word instead of falling
 * back to a generic "unknown" string.
 */
export function AssetStatusBadge({ status }: { status: AssetCurrentStatus }) {
  if (status === 'Unknown') {
    return (
      <Badge variant="outline" data-status={status}>
        {ASSET_STATUS_LABELS_AR.Unknown}
      </Badge>
    )
  }

  return <StatusBadge entity="asset" status={status} label={ASSET_STATUS_LABELS_AR[status]} />
}
