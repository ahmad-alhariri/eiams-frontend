/**
 * Warehouse WIRE TYPES the shared layer needs, moved verbatim from
 * `modules/warehouse/types/warehouse.api-types.ts` so `modules → shared` stays
 * the only dependency direction (shared code types against these, never
 * against the module). D-INT-02 §2.1 ownership is unchanged: this file mirrors
 * the backend DTOs documented in the warehouse module's api-types; the module
 * re-exports them, so every existing module import keeps compiling.
 */

export type Uuid = string

export type RecordStatus = 'Active' | 'Inactive'

/**
 * The six warehouse-capability operations the backend exposes
 * (`Domain/Common/OperationType.cs`); the seventh (`Opening`) is live per
 * `operationFromOrdinal`'s controller comment in the module api-types.
 */
export type CapabilityOperation =
  'Receiving' | 'Issue' | 'Transfer' | 'Count' | 'Return' | 'Adjustment' | 'Opening'

/**
 * `siteId` is a FLAT field on the wire. There is no nested `site` reference,
 * so a site label must be resolved by joining against the sites list — it
 * is not present on a warehouse record.
 *
 * `warehouseType` is a free-form string on the wire (backend `string`, not
 * an enum); observed live as "Storage". Deliberately not narrowed to a
 * union.
 */
export interface Warehouse {
  readonly id: Uuid
  readonly siteId: Uuid
  readonly organizationalUnitId?: Uuid | null
  readonly name: string
  readonly code: string
  readonly warehouseType: string
  readonly canHoldStock: boolean
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface ListWarehousesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly siteId?: string
  readonly status?: RecordStatus
}
