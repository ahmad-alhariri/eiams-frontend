import type { AssetMovementType } from '@/modules/asset/types/asset.types'

/**
 * Arabic labels for the immutable asset movement types (the live
 * `Domain.Common.AssetMovementType` vocabulary: Received, Transferred, Issued,
 * Returned, Disposed, OpeningRegistered).
 */
export const ASSET_MOVEMENT_TYPE_LABELS_AR = {
  Received: 'استلام',
  Transferred: 'تحويل',
  Issued: 'صرف',
  Returned: 'إرجاع',
  Disposed: 'استبعاد',
  OpeningRegistered: 'تسجيل افتتاحي',
} as const satisfies Record<AssetMovementType, string>
