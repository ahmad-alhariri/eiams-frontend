import type {
  InventoryBalance,
  StockMovement,
} from '@/modules/inventory/types/inventory.api-types'

import { fixtureUuid } from './factories'

/**
 * Inventory fixtures in the LIVE wire shape.
 *
 * These builders mirror `contracts/openapi/eiams-v1.consumer-baseline.json`
 * (`GET /inventory/balances`, `GET /inventory/movements`), which is the
 * authority for the handwritten `inventory.api-types` contract. Both backend
 * projections are flat: `InventoryBalanceResponse` serves `Id` + `WarehouseCode`
 * + `WarehouseName` + `MaterialCode` + `MaterialNameAr`, and
 * `StockMovementResponse` serves `Id` + `DocumentReferenceNumber` + `LineId` +
 * `PostedAtUtc` + `PostedBy` (a UUID STRING). There is no nested `warehouse` /
 * `material` reference on either wire record, so a fixture must never mint one.
 */

export const INVENTORY_WAREHOUSE_ID = fixtureUuid(30)
export const INVENTORY_WAREHOUSE_CODE = 'WH-CENTRAL'
export const INVENTORY_WAREHOUSE_NAME = 'المستودع المركزي'
export const INVENTORY_MATERIAL_ID = fixtureUuid(24)
export const INVENTORY_MATERIAL_CODE = 'IT-HW-PC-001'
export const INVENTORY_MATERIAL_NAME_AR = 'حاسوب مكتبي'
export const INVENTORY_BALANCE_ID = fixtureUuid(40)
export const INVENTORY_MOVEMENT_ID = fixtureUuid(70)
export const INVENTORY_DOCUMENT_ID = fixtureUuid(60)
export const INVENTORY_DOCUMENT_LINE_ID = fixtureUuid(61)
export const INVENTORY_POSTED_BY_ID = fixtureUuid(10)
export const INVENTORY_DOCUMENT_REFERENCE = 'RCP-2026-0001'
export const INVENTORY_TIMESTAMP = '2026-08-21T10:00:00.000Z'

/** `GET /inventory/balances` and `GET /inventory/balances/{balanceId}`. */
export function wireInventoryBalance(overrides: Partial<InventoryBalance> = {}): InventoryBalance {
  return {
    id: INVENTORY_BALANCE_ID,
    warehouseId: INVENTORY_WAREHOUSE_ID,
    warehouseCode: INVENTORY_WAREHOUSE_CODE,
    warehouseName: INVENTORY_WAREHOUSE_NAME,
    materialId: INVENTORY_MATERIAL_ID,
    materialCode: INVENTORY_MATERIAL_CODE,
    materialNameAr: INVENTORY_MATERIAL_NAME_AR,
    quantity: 10,
    lastUpdatedUtc: INVENTORY_TIMESTAMP,
    rowVersion: 1,
    lowStock: { state: 1, thresholdQuantity: 5 },
    ...overrides,
  }
}

/** `GET /inventory/movements` and `GET /inventory/movements/{movementId}`. */
export function wireStockMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: INVENTORY_MOVEMENT_ID,
    warehouseId: INVENTORY_WAREHOUSE_ID,
    warehouseCode: INVENTORY_WAREHOUSE_CODE,
    warehouseName: INVENTORY_WAREHOUSE_NAME,
    materialId: INVENTORY_MATERIAL_ID,
    materialCode: INVENTORY_MATERIAL_CODE,
    materialNameAr: INVENTORY_MATERIAL_NAME_AR,
    documentId: INVENTORY_DOCUMENT_ID,
    documentReferenceNumber: INVENTORY_DOCUMENT_REFERENCE,
    lineId: INVENTORY_DOCUMENT_LINE_ID,
    movementType: 'Receipt',
    quantityDelta: 5,
    postedAtUtc: INVENTORY_TIMESTAMP,
    postedBy: INVENTORY_POSTED_BY_ID,
    ...overrides,
  }
}
