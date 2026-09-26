/**
 * Backend response shapes (verified against `eiams-backend` C# DTOs):
 *
 * WarehouseResponse          → { Id, SiteId, Name, Code, WarehouseType, CanHoldStock, Status, RowVersion }
 * WarehouseCapabilityResponse → { CapabilityId, WarehouseId, DomainId, Operations (DomainCapabilities flags), RowVersion }
 * WarehouseMaterialSettingResponse → { WarehouseId, MaterialId, MinQuantity, MaxQuantity, Status, RowVersion }
 *
 * The document layer (`use-document-policy-gate.ts`) calls `validates(domainId, operation)`
 * — a (domainId, operation) predicate. Capabilities from the backend carry BOTH a warehouseId
 * AND a domainId, so capability validation must key on (warehouseId, domainId, operation).
 */

export type Uuid = string
export type RecordStatus = 'Active' | 'Inactive'
export type CapabilityOperation = 'Receiving' | 'Issue' | 'Transfer' | 'Count' | 'Return'

export interface NamedReference {
  readonly id: string
  readonly displayName: string
  readonly code?: string | null
}

/** Backend page envelope — meta uses `pageIndex` (1-based page number) per backend contract. */
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
// Warehouses
// ---------------------------------------------------------------------------

export interface Warehouse {
  readonly warehouseId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly siteId: Uuid
  readonly site: NamedReference
  readonly status: RecordStatus
  readonly rowVersion: number
  readonly locationAr?: string | null
}

export interface WarehouseUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly siteId: Uuid
  readonly locationAr?: string | null
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface WarehousePage {
  readonly items: ReadonlyArray<Warehouse>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Warehouse Capabilities
// ---------------------------------------------------------------------------
// Backend shape: each row is one *capability* (capabilityId), but the document
// layer only cares about (warehouseId, domainId, operations[]). We expose both
// shapes and let the service layer map.

export interface WarehouseCapability {
  readonly warehouseId: Uuid
  readonly domainId: Uuid
  readonly domain: NamedReference
  readonly operations: ReadonlyArray<CapabilityOperation>
  readonly rowVersion: number
}

export interface WarehouseCapabilityUpsertRequest {
  readonly warehouseId: Uuid
  readonly domainId: Uuid
  readonly operations: ReadonlyArray<CapabilityOperation>
  readonly rowVersion: number
}

// ---------------------------------------------------------------------------
// Warehouse Material Settings
// ---------------------------------------------------------------------------

export interface WarehouseMaterialSetting {
  readonly warehouseId: Uuid
  readonly materialId: Uuid
  readonly material: NamedReference
  readonly minQuantity?: number | null
  readonly maxQuantity?: number | null
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface WarehouseMaterialSettingUpsertRequest {
  readonly warehouseId: Uuid
  readonly materialId: Uuid
  readonly minQuantity?: number | null
  readonly maxQuantity?: number | null
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface WarehouseMaterialSettingPage {
  readonly items: ReadonlyArray<WarehouseMaterialSetting>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Query types (filter shapes)
// ---------------------------------------------------------------------------

export interface ListWarehousesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly siteId?: string
  readonly status?: RecordStatus
}

export interface ListWarehouseMaterialSettingsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly isActive?: boolean
}
