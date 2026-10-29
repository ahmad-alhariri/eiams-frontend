import type { ApiTransport, RequestContext } from '@/shared/api/api-transport'
import { withSignal } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'
import type {
  Warehouse,
  WarehouseCapability,
  WarehouseInitializationStateResponse,
  WarehouseMaterialSetting,
  WarehouseCreateRequest,
  WarehouseUpdateRequest,
  GrantWarehouseCapabilityRequest,
  AddWarehouseCapabilityOperationRequest,
  CreateWarehouseMaterialSettingRequest,
  UpdateWarehouseMaterialSettingRequest,
  SetWarehouseMaterialSettingStatusRequest,
  ListWarehousesQuery,
  ListWarehouseMaterialSettingsQuery,
  CapabilityOperation,
  InitializeWarehouseZeroStockRequest,
  Uuid,
} from '@/modules/warehouse/types/warehouse.api-types'
import type { ApiPage, ResourceIdResponse } from '@/shared/api/api-contracts'
import { pathWithId } from '@/shared/services/api-path'

const WAREHOUSES_PATH = '/warehouses'
const WAREHOUSE_PATH = '/warehouses/{warehouseId}'
const WAREHOUSE_INITIALIZATION_PATH = '/warehouses/{warehouseId}/initialization'
const WAREHOUSE_CAPABILITIES_PATH = '/warehouses/{warehouseId}/capabilities'
// Capability + operation commands live on the standalone resource, not under
// the warehouse sub-resource. The capability id is the route parameter on
// each, so the body never carries a `capabilityId` field.
const WAREHOUSE_CAPABILITY_GRANT_PATH = '/warehouse-capabilities'
const WAREHOUSE_CAPABILITY_PATH = '/warehouse-capabilities/{capabilityId}'
const WAREHOUSE_CAPABILITY_OPERATIONS_PATH = '/warehouse-capabilities/{capabilityId}/operations'
const WAREHOUSE_CAPABILITY_OPERATION_PATH =
  '/warehouse-capabilities/{capabilityId}/operations/{operationType}'
// Material settings are also a top-level resource, addressed by settingId.
// The list endpoint is the only one that still lives under a warehouse.
const WAREHOUSE_MATERIAL_SETTINGS_LIST_PATH = '/warehouses/{warehouseId}/material-settings'
const WAREHOUSE_MATERIAL_SETTINGS_ROOT_PATH = '/warehouse-material-settings'
const WAREHOUSE_MATERIAL_SETTING_PATH = '/warehouse-material-settings/{settingId}'
const WAREHOUSE_MATERIAL_SETTING_STATUS_PATH = '/warehouse-material-settings/{settingId}/status'
// The capability read serves the WHOLE matrix in one page. The endpoint pages
// (`PaginationQueryParameters`, default page size 20); asking for the max in a
// single read means a warehouse's granted-domain rows are never silently
// truncated to page 1 — the epic's core honesty rule. A warehouse with more
// than `MaximumPageSize` capabilities is a server-side paging concern, not one
// this read may paper over.
const CAPABILITY_READ_PAGE = 1
const CAPABILITY_READ_PAGE_SIZE = 100

function toQueryString(
  query: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  // Absent values are dropped rather than sent as `undefined`: axios
  // serialises `undefined` to the literal string "undefined", which the
  // server's `PaginationQueryParameters` validator rejects as a bad
  // Page value. Removing the key entirely is the only honest answer.
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

/**
 * Splits the pagination fields off a list query and sends them through the ONE
 * shared clamp, so a caller that holds a zero-based index (or an over-large
 * page) can never put `page=0` / `pageSize=200` on the wire.
 *
 * The backend binds `PaginationQueryParameters.Page` as `[Range(1, 21474836)]`
 * and rejects `page=0` with 400 `REQUEST_VALIDATION_FAILED`, which is why the
 * clamp lives here rather than at each call site. The remaining filter fields
 * pass through verbatim (`undefined` dropped). Field order is preserved
 * (page, pageSize, then the declared filters) so the request URL stays stable
 * for the suites that pin it.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): Record<string, string | number | boolean> {
  const { page, pageSize, ...filters } = query
  return toQueryString({
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  })
}

export interface WarehouseService {
  listWarehouses: (
    query: ListWarehousesQuery,
    context?: RequestContext,
  ) => Promise<ApiPage<Warehouse>>
  getWarehouse: (warehouseId: string, context?: RequestContext) => Promise<Warehouse>
  getInitializationState: (
    warehouseId: string,
    context?: RequestContext,
  ) => Promise<WarehouseInitializationStateResponse>
  initializeZeroStock: (
    warehouseId: string,
    request: InitializeWarehouseZeroStockRequest,
  ) => Promise<ResourceIdResponse>
  createWarehouse: (request: WarehouseCreateRequest) => Promise<ResourceIdResponse>
  updateWarehouse: (warehouseId: string, request: WarehouseUpdateRequest) => Promise<void>
  listWarehouseCapabilities: (
    warehouseId: string,
    context?: RequestContext,
  ) => Promise<ApiPage<WarehouseCapability>>
  grantWarehouseCapability: (
    request: GrantWarehouseCapabilityRequest,
  ) => Promise<ResourceIdResponse>
  revokeWarehouseCapability: (capabilityId: Uuid) => Promise<void>
  addWarehouseCapabilityOperation: (
    capabilityId: Uuid,
    request: AddWarehouseCapabilityOperationRequest,
  ) => Promise<ResourceIdResponse>
  removeWarehouseCapabilityOperation: (
    capabilityId: Uuid,
    operation: CapabilityOperation,
  ) => Promise<void>
  listWarehouseMaterialSettings: (
    warehouseId: string,
    query: ListWarehouseMaterialSettingsQuery,
    context?: RequestContext,
  ) => Promise<ApiPage<WarehouseMaterialSetting>>
  createWarehouseMaterialSetting: (
    request: CreateWarehouseMaterialSettingRequest,
  ) => Promise<ResourceIdResponse>
  updateWarehouseMaterialSetting: (
    settingId: Uuid,
    request: UpdateWarehouseMaterialSettingRequest,
  ) => Promise<void>
  setWarehouseMaterialSettingStatus: (
    settingId: Uuid,
    request: SetWarehouseMaterialSettingStatusRequest,
  ) => Promise<void>
}

export function createWarehouseService(transport: ApiTransport): WarehouseService {
  return {
    async listWarehouses(query, context) {
      return transport.requestPage<Warehouse>({
        path: WAREHOUSES_PATH,
        method: 'GET',
        query: withWirePagination(query),
        ...withSignal(context),
      })
    },

    async getWarehouse(warehouseId, context) {
      return transport.request<Warehouse>({
        path: pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
        ...withSignal(context),
      })
    },

    async getInitializationState(warehouseId, context) {
      return transport.request<WarehouseInitializationStateResponse>({
        path: pathWithId(WAREHOUSE_INITIALIZATION_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
        ...withSignal(context),
      })
    },

    async initializeZeroStock(warehouseId, request) {
      return transport.request<ResourceIdResponse>({
        path: pathWithId(WAREHOUSE_INITIALIZATION_PATH, '{warehouseId}', warehouseId),
        method: 'POST',
        body: request,
      })
    },

    async createWarehouse(request) {
      return transport.request<ResourceIdResponse>({
        path: WAREHOUSES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateWarehouse(warehouseId, request) {
      await transport.requestEmpty({
        path: pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
        method: 'PUT',
        body: request,
      })
    },

    async listWarehouseCapabilities(warehouseId, context) {
      return transport.requestPage<WarehouseCapability>({
        path: pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
        query: { page: CAPABILITY_READ_PAGE, pageSize: CAPABILITY_READ_PAGE_SIZE },
        ...withSignal(context),
      })
    },

    async grantWarehouseCapability(request) {
      return transport.request<ResourceIdResponse>({
        path: WAREHOUSE_CAPABILITY_GRANT_PATH,
        method: 'POST',
        body: request,
      })
    },

    async revokeWarehouseCapability(capabilityId) {
      await transport.requestEmpty({
        path: pathWithId(WAREHOUSE_CAPABILITY_PATH, '{capabilityId}', capabilityId),
        method: 'DELETE',
      })
    },

    async addWarehouseCapabilityOperation(capabilityId, request) {
      return transport.request<ResourceIdResponse>({
        path: pathWithId(WAREHOUSE_CAPABILITY_OPERATIONS_PATH, '{capabilityId}', capabilityId),
        method: 'POST',
        body: request,
      })
    },

    async removeWarehouseCapabilityOperation(capabilityId, operation) {
      // The wire path carries the enum NAME STRING; the body for DELETE
      // is intentionally empty. The endpoint is asymmetric by design
      // (POST binds int, DELETE binds the enum name) and the inversion
      // is captured in `operationOrdinal`/`operationFromOrdinal`.
      const path = pathWithId(
        WAREHOUSE_CAPABILITY_OPERATION_PATH,
        '{capabilityId}',
        capabilityId,
      ).replace('{operationType}', encodeURIComponent(operation))
      await transport.requestEmpty({
        path,
        method: 'DELETE',
      })
    },

    async listWarehouseMaterialSettings(warehouseId, query, context) {
      return transport.requestPage<WarehouseMaterialSetting>({
        path: pathWithId(WAREHOUSE_MATERIAL_SETTINGS_LIST_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
        query: withWirePagination(query),
        ...withSignal(context),
      })
    },

    async createWarehouseMaterialSetting(request) {
      return transport.request<ResourceIdResponse>({
        path: WAREHOUSE_MATERIAL_SETTINGS_ROOT_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateWarehouseMaterialSetting(settingId, request) {
      await transport.requestEmpty({
        path: pathWithId(WAREHOUSE_MATERIAL_SETTING_PATH, '{settingId}', settingId),
        method: 'PUT',
        body: request,
      })
    },

    async setWarehouseMaterialSettingStatus(settingId, request) {
      await transport.requestEmpty({
        path: pathWithId(WAREHOUSE_MATERIAL_SETTING_STATUS_PATH, '{settingId}', settingId),
        method: 'PUT',
        body: request,
      })
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Never `{} as
// any` — that default is what made the first runtime list call throw.
//
// This is the ONE warehouse service instance. Before 9uuf the module held
// three competing singletons: this one, plus private copies inside
// use-warehouse-queries.ts and use-warehouse-mutations.ts whose exported
// `useWarehouseService`/`setWarehouseService` had zero importers. Injecting
// only this one would have left 8 live query and mutation hooks calling an
// empty object, so `warehouse.service.test.ts` would have gone green while the
// warehouse UI stayed broken. The two hook-local copies are deleted, not
// injected; every warehouse hook imports this binding. Replaced during tests
// by `setWarehouseService`.
let warehouseService: WarehouseService = createWarehouseService(apiTransport)

export function setWarehouseService(transport: ApiTransport) {
  warehouseService = createWarehouseService(transport)
}

export { warehouseService }
