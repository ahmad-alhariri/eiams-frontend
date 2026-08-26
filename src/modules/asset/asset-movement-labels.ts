import type { AssetMovement } from '@/shared/types/generated/eiams-v1'

/** Arabic labels for the immutable asset movement event types (D-RAE-01). */
export const ASSET_MOVEMENT_TYPE_LABELS_AR: Readonly<Record<AssetMovement['eventType'], string>> = {
  Received: 'استلام',
  Issued: 'صرف',
  Returned: 'إرجاع',
  Disposed: 'استبعاد',
}
