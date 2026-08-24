import type { Asset } from '@/shared/types/generated/eiams-v1'

/**
 * Accessible label for one asset chip in the t05 issued-asset selector:
 * Arabic composition of asset number, serial, and material so screen readers
 * announce a meaningful identity.
 */
export function assetChipLabel(asset: Asset): string {
  const serial = asset.serialNumber ?? ''
  return serial === ''
    ? `الأصل ${asset.assetNumber}`
    : `الأصل ${asset.assetNumber} — الرقم التسلسلي ${serial}`
}
