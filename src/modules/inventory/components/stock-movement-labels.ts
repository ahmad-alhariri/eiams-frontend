import type { MovementType } from '@/modules/inventory/types/inventory.api-types'

/**
 * Canonical Arabic presentation labels for the `MovementType` union declared
 * in the module's handwritten wire contract. Keeping this registry in the
 * Inventory module gives the ledger and its later provenance page one typed
 * source, without introducing legacy event names or deriving a movement from
 * its quantity.
 */
export const STOCK_MOVEMENT_TYPE_LABELS_AR = {
  Receipt: 'استلام',
  Issue: 'صرف',
  TransferIn: 'تحويل وارد',
  TransferOut: 'تحويل صادر',
  AdjustmentIn: 'تسوية بالزيادة',
  AdjustmentOut: 'تسوية بالنقص',
  Opening: 'رصيد افتتاحي',
} as const satisfies Record<MovementType, string>

export function stockMovementTypeLabelAr(type: MovementType): string {
  return STOCK_MOVEMENT_TYPE_LABELS_AR[type]
}
