/** Backend response shapes for inventory module — verified against C# DTOs:
 *
 * InventoryBalanceResponse: Id, WarehouseId, WarehouseCode, WarehouseName,
 *   MaterialId, MaterialCode, MaterialNameAr, Quantity (decimal), LastUpdatedUtc, RowVersion
 * StockMovementResponse: Id, WarehouseId, WarehouseCode, WarehouseName,
 *   MaterialId, MaterialCode, MaterialNameAr, DocumentId, DocumentReferenceNumber,
 *   LineId, MovementType (string), QuantityDelta (decimal), PostedAtUtc, PostedBy
 */

export type Uuid = string

export interface NamedReference {
  readonly id: string
  readonly displayName: string
  readonly code?: string | null
}

export type MovementType =
  'Issue' | 'Opening' | 'Receipt' | 'TransferIn' | 'TransferOut' | 'AdjustmentIn' | 'AdjustmentOut'

export interface PageMeta {
  readonly page: number
  readonly pageIndex: number
  readonly pageSize: number
  readonly itemCount: number
  readonly totalItems: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
  readonly hasPreviousPage: boolean
}

// ---------------------------------------------------------------------------
// Inventory Balances
// ---------------------------------------------------------------------------

export interface InventoryBalance {
  readonly balanceId: Uuid
  readonly warehouseId: Uuid
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly warehouse: NamedReference
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly material: NamedReference
  readonly quantity: number
  readonly lastUpdated: string
  readonly lastUpdatedUtc: string
  readonly rowVersion: number
  readonly lowStock: {
    state: 'Disabled' | 'Low' | 'Sufficient' | 'NotConfigured'
    thresholdQuantity: number | null
  }
}

export interface InventoryBalancePage {
  readonly items: ReadonlyArray<InventoryBalance>
  readonly meta: PageMeta
}

export interface ListInventoryBalancesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly warehouseId?: string
  readonly materialId?: string
}

// ---------------------------------------------------------------------------
// Stock Movements
// ---------------------------------------------------------------------------

export interface StockMovement {
  readonly movementId: Uuid
  readonly warehouseId: Uuid
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly warehouse: NamedReference
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly material: NamedReference
  readonly documentId: Uuid
  readonly documentReferenceNumber: string
  readonly documentReference: string
  readonly documentLineId: Uuid
  readonly lineId: Uuid
  readonly movementType: MovementType
  readonly quantityDelta: number
  readonly postedAtUtc: string
  readonly postedAt: string
  readonly postedBy: Uuid
}

export interface StockMovementPage {
  readonly items: ReadonlyArray<StockMovement>
  readonly meta: PageMeta
}

export interface ListStockMovementsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly warehouseId?: string
  readonly materialId?: string
  readonly documentId?: string
  readonly movementType?: MovementType
}
