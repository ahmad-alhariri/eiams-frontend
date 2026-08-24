import type { AssetDerivedStatus } from '@/shared/types/generated/eiams-v1'

/** Arabic labels for the D-AST-02 derived asset statuses (list filter + badges). */
export const ASSET_DERIVED_STATUS_LABELS_AR: Readonly<Record<AssetDerivedStatus, string>> = {
  InStock: 'في المخزن',
  Issued: 'مصروف',
  InCustody: 'قيد العهدة',
  Disposed: 'مستبعد',
}

export const ASSET_DERIVED_STATUSES = Object.keys(
  ASSET_DERIVED_STATUS_LABELS_AR,
) as AssetDerivedStatus[]
