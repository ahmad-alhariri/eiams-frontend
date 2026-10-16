/**
 * Backend response shapes (verified against `eiams-backend` C# DTOs and the
 * running API on 2026-10-12).
 *
 * The wire is the source of truth per D-INT-02 §2.1. The frozen
 * OpenAPI-snapshot types have been deleted from the warehouse module
 * (`eiams-frontend-whhu.5`); every shape here was hand-written from the
 * controllers, validators, and DTOs in `eiams-backend`.
 *
 * Warehouse list:
 *   WarehouseResponse
 *     → { id, siteId, organizationalUnitId?, name, code, warehouseType,
 *         canHoldStock, status, rowVersion }
 *
 * Warehouse capability (per-warehouse projection):
 *   WarehouseCapabilityResponse
 *     → { id, warehouseId, materialDomainId, materialDomainCode,
 *         materialDomainName, status, operations: string[] (OperationType
 *         names — Receiving/Issue/Transfer/Count/Return/Adjustment) }
 *   No rowVersion. The capability table does not carry a concurrency token
 *   (no `IsConcurrencyToken()` in WarehouseCapabilityConfiguration) and the
 *   controller emits no such field. Submitting one is silently ignored, so
 *   do not fabricate one.
 *
 * Warehouse material setting (per-warehouse projection):
 *   WarehouseMaterialSettingResponse
 *     → { id, warehouseId, materialId, materialCode, materialNameAr,
 *         minQuantity, maxQuantity, status }
 *   No rowVersion. No nested `material: NamedReference` — materialCode and
 *   materialNameAr are flat fields on the projection. Min/Max are
 *   non-nullable `decimal` on the wire (the validator requires
 *   0 <= min <= max, both present).
 *
 * The document layer (`use-document-policy-gate.ts`) calls
 * `validates(domainId, operation)` — a (domainId, operation) predicate.
 * Capabilities from the backend carry BOTH a warehouseId AND a
 * materialDomainId, so capability validation must key on
 * (warehouseId, domainId, operation).
 */

export type Uuid = string
export type RecordStatus = 'Active' | 'Inactive'

/**
 * The six warehouse-capability operations the backend exposes
 * (`Domain/Common/OperationType.cs`). Adjustment was missing from the
 * frozen frontend union, which silently dropped a granted Adjustment on
 * any save — the `addOperation` POST would succeed but the read never
 * surfaced the toggle, and the editor rendered an "incomplete" matrix
 * without telling the user.
 */
export type CapabilityOperation =
  'Receiving' | 'Issue' | 'Transfer' | 'Count' | 'Return' | 'Adjustment' | 'Opening'

/**
 * The backend serialises `OperationType` as the enum NAME STRING (not the
 * ordinal) on the read (`WarehouseCapabilityResponse.Operations` and the
 * sibling `WarehouseCapabilityOperationResponse.OperationType`). The minimal
 * API JsonOptions used by `Results.Ok` does not carry the global
 * `JsonStringEnumConverter`; the add endpoint, conversely, binds the int
 * ordinal because the controller parameter is typed `int OperationType`.
 * Encode the asymmetry here in one place and surface a single function
 * for each direction so the wire and the editor never drift.
 */
export const CAPABILITY_OPERATION_VALUES: readonly CapabilityOperation[] = [
  'Receiving',
  'Issue',
  'Transfer',
  'Count',
  'Return',
  'Adjustment',
  'Opening',
] as const

export function operationOrdinal(name: CapabilityOperation): number {
  return CAPABILITY_OPERATION_VALUES.indexOf(name)
}

export function operationFromOrdinal(ordinal: number): CapabilityOperation {
  // The backend rejects ordinals outside [0, 5] at the controller, so a
  // type cast is safe; we still guard at runtime because the read is
  // a string enum and a server-side addition (seven operations tomorrow)
  // would silently project as `unknown` without this branch.
  const value = CAPABILITY_OPERATION_VALUES[ordinal]
  if (value !== undefined) return value
  throw new RangeError(`Unknown CapabilityOperation ordinal: ${ordinal}`)
}

export function isCapabilityOperation(value: string): value is CapabilityOperation {
  return (CAPABILITY_OPERATION_VALUES as readonly string[]).includes(value)
}

/**
 * Status (`Active` / `Inactive`) is also exposed as an int ordinal on
 * some wire paths (e.g. `Domain.Common.Status` is a `0|1` enum and the
 * future `setWarehouseMaterialSettingStatus` could one day take an
 * int). The lookup table is already provided by the older `statusOrdinal`
 * below; this block keeps the comment so the relationship to the
 * `CAPABILITY_OPERATION_VALUES` / `operationOrdinal` table is documented.
 */

/**
 * Material domain (catalog projection).
 *
 * The route is `/catalog/domains`, NOT `/catalog/material-domains` (the old
 * frozen snapshot). Response carries `name` (not `nameAr`) and `code`, with
 * no materialDomainId alias and no rowVersion. Used by the warehouse
 * capabilities editor to populate the domain picker.
 */
export interface MaterialDomain {
  readonly id: Uuid
  readonly name: string
  readonly code: string
  readonly status: RecordStatus
}

// ---------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------

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

export interface WarehouseCreateRequest {
  readonly siteId: Uuid
  readonly organizationalUnitId: Uuid
  readonly name: string
  readonly code: string
  readonly warehouseType: string
  readonly canHoldStock: boolean
}

/**
 * `PUT /warehouses/{id}` — the only one of these aggregates whose update is
 * versioned. `expectedRowVersion` is the value the read served as
 * `rowVersion`, verbatim: the handler compares it directly against the
 * column and the validator rejects `<= 0`, while a freshly created row has
 * rowVersion 1. Do not "normalise" it to 0-based — that sends 0 and is
 * rejected before the version check even runs. `code` and `siteId` are
 * create-only.
 */
export interface WarehouseUpdateRequest {
  readonly organizationalUnitId: Uuid
  readonly name: string
  readonly warehouseType: string
  readonly canHoldStock: boolean
  readonly expectedRowVersion: number
}

// ---------------------------------------------------------------------------
// Warehouse Capabilities
// ---------------------------------------------------------------------------

/**
 * Backend shape: each row is one *capability* (capabilityId), tied to
 * exactly one (warehouseId, materialDomainId) pair. Operations are
 * projected inline by `GetWarehouseCapabilitiesQueryHandler` so the editor
 * does not need to issue 1+N requests.
 *
 * The frontend had the wrong shape (`{ warehouseId, domainId, domain:
 * NamedReference, operations, rowVersion }`): `domain: NamedReference` does
 * not exist on the wire, the id is `id` (not `warehouseId`), the field is
 * `materialDomainId` (not `domainId`), the read carries `materialDomainCode`
 * + `materialDomainName` flat, and `rowVersion` is not present. The UI was
 * rendering whatever the server happened to omit as `undefined`, then
 * crashing on `.domain.displayName`.
 */
export interface WarehouseCapability {
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly materialDomainId: Uuid
  readonly materialDomainCode: string
  readonly materialDomainName: string
  readonly status: RecordStatus
  readonly operations: ReadonlyArray<CapabilityOperation>
}

/**
 * `POST /warehouse-capabilities` — grant a domain capability. The handler
 * is idempotent and reactivates an Inactive row rather than creating a
 * duplicate (unique constraint on `warehouseId` + `materialDomainId`), so
 * the route doubles as "reactivate". `warehouseId` belongs to the body, not
 * the route, so the same request shape covers cross-warehouse bulk
 * operations if we ever need them.
 */
export interface GrantWarehouseCapabilityRequest {
  readonly warehouseId: Uuid
  readonly materialDomainId: Uuid
}

/**
 * `POST /warehouse-capabilities/{capabilityId}/operations` body. The
 * controller parameter is typed `int OperationType`, so the request
 * carries the int ordinal even though the read returns string names. The
 * inversion is captured in `operationOrdinal` / `operationFromOrdinal`.
 */
export interface AddWarehouseCapabilityOperationRequest {
  readonly operationType: number
}

// ---------------------------------------------------------------------------
// Warehouse Material Settings
// ---------------------------------------------------------------------------

/**
 * Material setting per (warehouseId, materialId) pair. The wire carries
 * `id` (the setting's own id, used for the per-setting update routes), no
 * rowVersion, no nested material object — only flat `materialCode` and
 * `materialNameAr`. Min/Max are non-nullable decimals on the wire; the
 * read normalises `null`/missing to 0 to keep the UI contract simple but
 * the wire stays honest.
 */
export interface WarehouseMaterialSetting {
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly minQuantity: number
  readonly maxQuantity: number
  readonly status: RecordStatus
}

/**
 * `POST /warehouse-material-settings` — create one setting.
 *
 * The body carries `warehouseId` (unlike the old `PUT /warehouses/{id}/
 * material-settings` whose route already named the warehouse, and whose
 * body omitted it). The per-setting POST is the create path; the per-
 * setting PUT is the update path. There is no wholesale replace.
 */
export interface CreateWarehouseMaterialSettingRequest {
  readonly warehouseId: Uuid
  readonly materialId: Uuid
  readonly minQuantity: number
  readonly maxQuantity: number
}

/**
 * `PUT /warehouse-material-settings/{settingId}` body. The route is per-
 * setting (with its own id), not per-warehouse. Min/Max only — status
 * rides the separate `/status` route. No rowVersion, no warehouseId (the
 * route already names both).
 */
export interface UpdateWarehouseMaterialSettingRequest {
  readonly minQuantity: number
  readonly maxQuantity: number
}

/**
 * `PUT /warehouse-material-settings/{settingId}/status` body. Status only,
 * so a status toggle and a threshold edit never ride the same call. A
 * single call hits the explicit conflict path (`409 ALREADY_ACTIVE` /
 * `ALREADY_INACTIVE` etc.) without a save dialog ambiguity.
 *
 * `status` is the INT ORDINAL, not the enum name. The controller binds
 * `RequestBody { int Status }` and casts `(Status)request.Status`
 * (`SetWarehouseMaterialSettingStatusController.cs`), so the wire expects
 * `0`/`1`: a string `"Active"` cannot bind an int and fails model binding with
 * a 400 before the handler body runs. The mapping is `statusOrdinal` below,
 * living beside the capability operation ordinal so the API's two int-vs-name
 * asymmetries share one home and one test.
 */
export interface SetWarehouseMaterialSettingStatusRequest {
  readonly status: number
}

/**
 * Ordinal of the shared `Domain.Common.Status` enum on the wire
 * (`Active = 0`, `Inactive = 1`). The status write route binds an int and the
 * read serialises the enum as its NAME STRING, the same asymmetry as the
 * capability operations; encode it once here.
 */
export function statusOrdinal(status: RecordStatus): number {
  return status === 'Active' ? 0 : 1
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

// ---------------------------------------------------------------------------
// Warehouse initialization state (D-OPEN-02, PRD §6.2, §6.4, §6.10, §6.12)
// ---------------------------------------------------------------------------

/**
 * Wire projection of the explicit `WarehouseInitializationState` row.
 *
 * `status` is one of:
 *  - `NotInitialized` — no state row + no positive Opening movement.
 *  - `Initialized` — initialization completed with positive Opening stock.
 *  - `ZeroStock` — initialization completed via the explicit zero-stock path.
 *  - `Reversed` — a prior initialization was reversed.
 */
export type WarehouseInitializationStatus =
  'NotInitialized' | 'Initialized' | 'ZeroStock' | 'Reversed'

/**
 * `Application.Warehouses.GetInitializationState.WarehouseInitializationStateResponse`.
 *
 * Endpoint: `GET /api/v1/warehouses/{warehouseId}/initialization`. The UI
 * uses this to render the per-warehouse initialization badge truthfully
 * without re-deriving it from the Opening documents list.
 */
export interface WarehouseInitializationStateResponse {
  readonly warehouseId: Uuid
  readonly status: WarehouseInitializationStatus
  readonly sourceDocumentId: Uuid | null
  /** ISO date `YYYY-MM-DD` — the cut-off date the inventory represents. */
  readonly asOfDate: string | null
  readonly isZeroStock: boolean
  readonly initializedAtUtc: string | null
  readonly initializedBy: Uuid | null
  readonly reversedAtUtc: string | null
  readonly reversedBy: Uuid | null
}

/**
 * `Application.WarehouseDocuments.Opening.ZeroStockInitializeWarehouseCommand`.
 *
 * Endpoint: `POST /api/v1/warehouses/{warehouseId}/initialization`. Records
 * the canonical zero-stock initialization for a warehouse that physically
 * contains no inventory at the approved cut-off date. Produces no document,
 * no Opening stock movements, and no Asset records — just the
 * `WarehouseInitializationState` row with `IsZeroStock = true`.
 *
 * Requires `document.create` at Warehouse scope (D-RBAC-02): the seeded
 * permission catalog does not grant this code at Site or Enterprise scope,
 * so a Site/Enterprise Manager cannot invoke the command even by direct
 * API call. The 403 + 404 refusal paths therefore run server-side and the
 * UI never needs to second-guess them.
 */
export interface InitializeWarehouseZeroStockRequest {
  /** ISO date `YYYY-MM-DD` — the cut-off date the (empty) inventory represents. */
  readonly asOfDate: string
}
