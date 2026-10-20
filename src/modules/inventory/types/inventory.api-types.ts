/** Backend response shapes for inventory module — verified against C# DTOs:
 *
 * InventoryBalanceResponse: Id, WarehouseId, WarehouseCode, WarehouseName,
 *   MaterialId, MaterialCode, MaterialNameAr, Quantity (decimal), LastUpdatedUtc, RowVersion
 * StockMovementResponse: Id, WarehouseId, WarehouseCode, WarehouseName,
 *   MaterialId, MaterialCode, MaterialNameAr, DocumentId, DocumentReferenceNumber,
 *   LineId, MovementType (string), QuantityDelta (decimal), PostedAtUtc, PostedBy
 */

export type Uuid = string

export type MovementType =
  'Issue' | 'Opening' | 'Receipt' | 'TransferIn' | 'TransferOut' | 'AdjustmentIn' | 'AdjustmentOut'

/**
 * D-INV-READ-01 sorting vocabulary. Values are the contract members served by
 * `Application.Abstractions.Sorting.SortDirection` and the two
 * `*SortField` enums; the backend binds them case-sensitively and rejects an
 * unknown member with 400 rather than substituting the default, so these
 * unions are the exact set of strings the wire accepts.
 */
export type SortDirection = 'Ascending' | 'Descending'

export type InventoryBalanceSortField =
  'WarehouseDisplayName' | 'MaterialDisplayName' | 'Quantity' | 'LastUpdated'

export type StockMovementSortField =
  'PostedAt' | 'WarehouseDisplayName' | 'MaterialDisplayName' | 'MovementType' | 'QuantityDelta'

/**
 * Low-stock FILTER vocabulary: the live API accepts the state NAME in the
 * `lowStockState` query parameter (`?lowStockState=Low` → 200).
 *
 * The RESPONSE is different: `InventoryBalance.lowStock.state` is numeric (see
 * `InventoryLowStockStateCode`). The browser never compares quantities with
 * thresholds itself.
 */
export type InventoryLowStockState = 'Low' | 'Sufficient' | 'NotConfigured' | 'Disabled'

/**
 * Numeric wire encoding of the server-computed low-stock state. Balance results
 * leave the backend through a Minimal API `IResult`, which serializes with
 * `Microsoft.AspNetCore.Http.Json.JsonOptions` — the MVC `JsonStringEnumConverter`
 * is not registered there — so enums arrive as numbers. 0=Low / 1=Sufficient /
 * 2=NotConfigured / 3=Disabled follows the backend `LowStockState` declaration
 * order. Switching the wire to names would require an API version bump.
 */
export type InventoryLowStockStateCode = 0 | 1 | 2 | 3

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
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly quantity: number
  readonly lastUpdatedUtc: string
  readonly rowVersion: number
  readonly lowStock: {
    state: InventoryLowStockStateCode
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
  readonly sortBy?: InventoryBalanceSortField
  readonly sortDirection?: SortDirection
  readonly lowStockState?: InventoryLowStockState
}

// ---------------------------------------------------------------------------
// Stock Movements
// ---------------------------------------------------------------------------

export interface StockMovement {
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly documentId: Uuid
  readonly documentReferenceNumber: string
  readonly lineId: Uuid
  readonly movementType: MovementType
  readonly quantityDelta: number
  readonly postedAtUtc: string
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
  readonly sortBy?: StockMovementSortField
  readonly sortDirection?: SortDirection
  readonly fromUtc?: string
  readonly toUtc?: string
}
