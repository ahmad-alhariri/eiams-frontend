/**
 * Backend response shapes (verified against `eiams-backend` C# DTOs AND the
 * running API on 2026-10-05):
 *
 * WarehouseResponse          → { id, siteId, organizationalUnitId?, name, code,
 *                               warehouseType, canHoldStock, status, rowVersion }
 * WarehouseCapabilityResponse → { CapabilityId, WarehouseId, DomainId, Operations (DomainCapabilities flags), RowVersion }
 * WarehouseMaterialSettingResponse → { WarehouseId, MaterialId, MinQuantity, MaxQuantity, Status, RowVersion }
 *
 * Live proof: `GET /warehouses` returns
 * `{"id":"…","siteId":"…","organizationalUnitId":"…","name":"Alepo Store …",
 *   "code":"WALE4491","warehouseType":"Storage","canHoldStock":true,
 *   "status":"Active","rowVersion":1}`.
 *
 * txq4 corrected this file: it previously declared `warehouseId`, `nameAr`,
 * `locationAr?` and a nested `site: NamedReference`, none of which the backend
 * serves, while omitting `warehouseType` / `canHoldStock` / `organizationalUnitId`
 * which it does. `rowVersion` was the one field it got right — which is why the
 * warehouse aggregate can carry optimistic concurrency.
 *
 * The document layer (`use-document-policy-gate.ts`) calls
 * `validates(domainId, operation)` — a (domainId, operation) predicate.
 * Capabilities from the backend carry BOTH a warehouseId AND a domainId, so
 * capability validation must key on (warehouseId, domainId, operation).
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

/** `siteId` is a FLAT field on the wire. There is no nested `site` reference, so
 *  a site label must be resolved by joining against the sites list — it is not
 *  present on a warehouse record.
 *
 *  `warehouseType` is a free-form string on the wire (backend `string`, not an
 *  enum); observed live as "Storage". Deliberately not narrowed to a union. */
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

export interface WarehouseCreateRequest {
  readonly siteId: Uuid
  readonly organizationalUnitId: Uuid
  readonly name: string
  readonly code: string
  readonly warehouseType: string
  readonly canHoldStock: boolean
}

/** `PUT /warehouses/{id}` — the ONLY one of these aggregates whose update is
 *  versioned. `expectedRowVersion` is the value the read served as `rowVersion`,
 *  verbatim: the handler compares it directly against the column and the
 *  validator rejects `<= 0`, while a freshly created row has rowVersion 1. Do
 *  not "normalise" it to 0-based — that sends 0 and is rejected before the
 *  version check even runs. `code` and `siteId` are create-only. */
export interface WarehouseUpdateRequest {
  readonly organizationalUnitId: Uuid
  readonly name: string
  readonly warehouseType: string
  readonly canHoldStock: boolean
  readonly expectedRowVersion: number
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

/**
 * `PUT /warehouses/{warehouseId}/material-settings`.
 *
 * `warehouseId` is carried by the ROUTE, so it is deliberately absent from the
 * body. The mapper previously emitted `warehouseId: existing?.warehouseId ?? ''`,
 * which for a NEW setting sent the empty string — and the backend's create
 * request binds `[JsonRequired] Guid WarehouseId`, so the placeholder was a
 * guaranteed rejection rather than a harmless extra field. This mirrors the
 * `WarehouseUpdateRequest` rule: a field the route already names is not repeated
 * in the body.
 */
export interface WarehouseMaterialSettingUpsertRequest {
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
