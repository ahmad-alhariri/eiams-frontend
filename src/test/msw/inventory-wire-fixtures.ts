import type {
  InventoryBalance,
  NamedReference,
  StockMovement,
} from '@/modules/inventory/types/inventory.api-types'

import { fixtureUuid } from './factories'

/**
 * Inventory fixtures in the REAL wire shape (`inventory.api-types`), minted
 * locally.
 *
 * WHY NOT THE SHARED FACTORIES. `createInventoryBalance` in `./factories` is
 * typed against the FROZEN GENERATED snapshot, whose `InventoryBalance` carries
 * only `balanceId` / `warehouse` / `material` / `quantity` / `lastUpdated` /
 * `rowVersion` / `lowStock` — none of the flat `warehouseId` / `materialId` /
 * `materialCode` / `materialNameAr` / `lastUpdatedUtc` columns the backend
 * actually projects, and a `StockMovement` built the same way carries the
 * GENERATED `postedBy: NamedReference`. The production inventory service is
 * typed against the handwritten contract, so a fixture in the generated shape is
 * a record the API would never send.
 *
 * The `postedBy` divergence is not cosmetic and was settled by reading the
 * backend rather than by picking whichever side made the test pass:
 * `Application/StockMovements/GetList/StockMovementResponse.cs` projects
 * `Guid PostedBy` straight off `movement.PostedBy`, so the wire value is a
 * UUID STRING. `inventory.api-types.StockMovement.postedBy: Uuid` is therefore
 * correct, and it is the generated fixture's nested `NamedReference` that is
 * the fiction — which is why these builders answer with a bare string and the
 * detail page's `{movement.postedBy}` React child is the honest render.
 *
 * The nested `warehouse` / `material` references are NOT from the C# DTO either
 * (`InventoryBalanceResponse` and `StockMovementResponse` project flat
 * `WarehouseCode` + `WarehouseName` / `MaterialCode` + `MaterialNameAr`), but the
 * handwritten contract declares them and the pages read
 * `record.warehouse.displayName` / `record.material.displayName` directly, so
 * they are kept here and derived from the flat ids: a fixture can never pair a
 * warehouse reference whose `id` disagrees with its `warehouseId`.
 *
 * `createInventoryBalance` itself is left in its generated shape because the
 * document, custody and cross-module journey suites still read it there; the
 * mismatch is filed against `eiams-frontend-tgl3`.
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

function warehouseReference(): NamedReference {
  return {
    id: INVENTORY_WAREHOUSE_ID,
    displayName: INVENTORY_WAREHOUSE_NAME,
    code: INVENTORY_WAREHOUSE_CODE,
  }
}

function materialReference(): NamedReference {
  return {
    id: INVENTORY_MATERIAL_ID,
    displayName: INVENTORY_MATERIAL_NAME_AR,
    code: INVENTORY_MATERIAL_CODE,
  }
}

/**
 * `GET /inventory/balances` and `GET /inventory/balances/{balanceId}` — the flat
 * columns the C# DTO projects, plus the `lowStock` projection the detail page
 * renders.
 */
export function wireInventoryBalance(overrides: Partial<InventoryBalance> = {}): InventoryBalance {
  return {
    balanceId: INVENTORY_BALANCE_ID,
    warehouseId: INVENTORY_WAREHOUSE_ID,
    warehouseCode: INVENTORY_WAREHOUSE_CODE,
    warehouseName: INVENTORY_WAREHOUSE_NAME,
    warehouse: warehouseReference(),
    materialId: INVENTORY_MATERIAL_ID,
    materialCode: INVENTORY_MATERIAL_CODE,
    materialNameAr: INVENTORY_MATERIAL_NAME_AR,
    material: materialReference(),
    quantity: 10,
    lastUpdated: INVENTORY_TIMESTAMP,
    lastUpdatedUtc: INVENTORY_TIMESTAMP,
    rowVersion: 1,
    lowStock: { state: 'Sufficient', thresholdQuantity: 5 },
    ...overrides,
  }
}

/**
 * `GET /inventory/movements` and `GET /inventory/movements/{movementId}`.
 *
 * `postedBy` is the UUID STRING the backend serves — see the header.
 */
export function wireStockMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    movementId: INVENTORY_MOVEMENT_ID,
    warehouseId: INVENTORY_WAREHOUSE_ID,
    warehouseCode: INVENTORY_WAREHOUSE_CODE,
    warehouseName: INVENTORY_WAREHOUSE_NAME,
    warehouse: warehouseReference(),
    materialId: INVENTORY_MATERIAL_ID,
    materialCode: INVENTORY_MATERIAL_CODE,
    materialNameAr: INVENTORY_MATERIAL_NAME_AR,
    material: materialReference(),
    documentId: INVENTORY_DOCUMENT_ID,
    documentReferenceNumber: INVENTORY_DOCUMENT_REFERENCE,
    documentReference: INVENTORY_DOCUMENT_REFERENCE,
    documentLineId: INVENTORY_DOCUMENT_LINE_ID,
    lineId: INVENTORY_DOCUMENT_LINE_ID,
    movementType: 'Receipt',
    quantityDelta: 5,
    postedAtUtc: INVENTORY_TIMESTAMP,
    postedAt: INVENTORY_TIMESTAMP,
    postedBy: INVENTORY_POSTED_BY_ID,
    ...overrides,
  }
}
