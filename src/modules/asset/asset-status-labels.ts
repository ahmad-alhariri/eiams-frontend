import type { AssetCurrentStatus } from '@/modules/asset/types/asset.types'

/**
 * Arabic labels for the LIVE asset statuses (list filter + badges).
 *
 * The live API serves FIVE states (`Domain.Common.AssetCurrentStatus`):
 * `InStock`, `Issued`, `InCustody`, `Disposed` and `Unknown`. The fifth one is
 * the server's own "the asset is in a state I cannot classify" answer, so it
 * is labelled like any other state instead of being left to a generic
 * fallback.
 */
export const ASSET_STATUS_LABELS_AR = {
  InStock: 'في المخزن',
  Issued: 'مصروف',
  InCustody: 'قيد العهدة',
  Disposed: 'مستبعد',
  Unknown: 'غير معروف',
} as const satisfies Record<AssetCurrentStatus, string>

export const ASSET_STATUSES = Object.keys(ASSET_STATUS_LABELS_AR) as AssetCurrentStatus[]

/** The four SETTLED states — the live enum without its `Unknown` fallback. */
type SettledAssetStatus = Exclude<AssetCurrentStatus, 'Unknown'>

/**
 * The reports module still imports the snapshot-era names for the same
 * labels; they stay as aliases of this module's map so that consumer keeps
 * compiling while it is migrated onto the live vocabulary.
 */
export const ASSET_DERIVED_STATUS_LABELS_AR: Readonly<Record<SettledAssetStatus, string>> =
  ASSET_STATUS_LABELS_AR

export const ASSET_DERIVED_STATUSES: readonly SettledAssetStatus[] = ASSET_STATUSES.filter(
  (status): status is SettledAssetStatus => status !== 'Unknown',
)
