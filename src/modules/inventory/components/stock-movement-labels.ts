import type { StockMovementType } from '@/shared/types/generated/eiams-v1'

/**
 * Canonical Arabic presentation labels for the generated StockMovementType
 * union. Keeping this registry in the Inventory module gives the ledger and
 * its later provenance page one typed source, without introducing legacy
 * event names or deriving a movement from its quantity.
 */
export const STOCK_MOVEMENT_TYPE_LABELS_AR = {
  Receipt: 'استلام',
  Issue: 'صرف',
  TransferIn: 'تحويل وارد',
  TransferOut: 'تحويل صادر',
  AdjustmentIn: 'تسوية بالزيادة',
  AdjustmentOut: 'تسوية بالنقص',
  Opening: 'رصيد افتتاحي',
} as const satisfies Record<StockMovementType, string>

export function stockMovementTypeLabelAr(type: StockMovementType): string {
  return STOCK_MOVEMENT_TYPE_LABELS_AR[type]
}
