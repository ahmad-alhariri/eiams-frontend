import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type {
  Warehouse,
  WarehouseCapability,
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSetting,
  WarehouseMaterialSettingPage,
  WarehouseMaterialSettingUpsertRequest,
  WarehousePage,
  WarehouseCreateRequest,
  WarehouseUpdateRequest,
  ListWarehousesQuery,
  ListWarehouseMaterialSettingsQuery,
} from '@/modules/warehouse/types/warehouse.api-types'
import type { ApiPage, ResourceIdResponse } from '@/shared/api/api-contracts'

const WAREHOUSES_PATH = '/warehouses'
const WAREHOUSE_PATH = '/warehouses/{warehouseId}'
const WAREHOUSE_CAPABILITIES_PATH = '/warehouses/{warehouseId}/capabilities'
const WAREHOUSE_MATERIAL_SETTINGS_PATH = '/warehouses/{warehouseId}/material-settings'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

function toWarehousePage(apiPage: ApiPage<Warehouse>): WarehousePage {
  return {
    items: apiPage.items,
    meta: {
      pageIndex: apiPage.page,
      page: apiPage.page,
      pageSize: apiPage.pageSize,
      itemCount: apiPage.totalItems,
      totalItems: apiPage.totalItems,
      totalCount: apiPage.totalItems,
      totalPages: apiPage.totalPages,
      hasNextPage: apiPage.hasNextPage,
      hasPreviousPage: apiPage.hasPreviousPage,
    },
  }
}

function toMaterialSettingsPage(
  apiPage: ApiPage<WarehouseMaterialSetting>,
): WarehouseMaterialSettingPage {
  return {
    items: apiPage.items,
    meta: {
      pageIndex: apiPage.page,
      page: apiPage.page,
      pageSize: apiPage.pageSize,
      itemCount: apiPage.totalItems,
      totalItems: apiPage.totalItems,
      totalCount: apiPage.totalItems,
      totalPages: apiPage.totalPages,
      hasNextPage: apiPage.hasNextPage,
      hasPreviousPage: apiPage.hasPreviousPage,
    },
  }
}

export interface WarehouseService {
  listWarehouses: (query: ListWarehousesQuery) => Promise<WarehousePage>
  getWarehouse: (warehouseId: string) => Promise<Warehouse>
  createWarehouse: (request: WarehouseCreateRequest) => Promise<ResourceIdResponse>
  updateWarehouse: (warehouseId: string, request: WarehouseUpdateRequest) => Promise<void>
  getWarehouseCapabilities: (warehouseId: string) => Promise<readonly WarehouseCapability[]>
  replaceWarehouseCapabilities: (
    warehouseId: string,
    request: readonly WarehouseCapabilityUpsertRequest[],
  ) => Promise<readonly WarehouseCapability[]>
  listWarehouseMaterialSettings: (
    warehouseId: string,
    query: ListWarehouseMaterialSettingsQuery,
  ) => Promise<WarehouseMaterialSettingPage>
  upsertWarehouseMaterialSetting: (
    warehouseId: string,
    request: WarehouseMaterialSettingUpsertRequest,
  ) => Promise<WarehouseMaterialSetting>
}

export function createWarehouseService(transport: ApiTransport): WarehouseService {
  return {
    async listWarehouses(query) {
      return toWarehousePage(
        await transport.requestPage<Warehouse>({
          path: WAREHOUSES_PATH,
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      )
    },

    async getWarehouse(warehouseId) {
      const response = await transport.request<Warehouse>({
        path: pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
      })
      return response
    },

    async createWarehouse(request) {
      return await transport.request<ResourceIdResponse>({
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

    async getWarehouseCapabilities(warehouseId) {
      const response = await transport.request<readonly WarehouseCapability[]>({
        path: pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
      })
      return response
    },

    async replaceWarehouseCapabilities(warehouseId, request) {
      const response = await transport.request<readonly WarehouseCapability[]>({
        path: pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        method: 'PUT',
        body: request,
      })
      return response
    },

    async listWarehouseMaterialSettings(warehouseId, query) {
      return toMaterialSettingsPage(
        await transport.requestPage<WarehouseMaterialSetting>({
          path: pathWithId(WAREHOUSE_MATERIAL_SETTINGS_PATH, '{warehouseId}', warehouseId),
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      )
    },

    async upsertWarehouseMaterialSetting(warehouseId, request) {
      const response = await transport.request<WarehouseMaterialSetting>({
        path: pathWithId(WAREHOUSE_MATERIAL_SETTINGS_PATH, '{warehouseId}', warehouseId),
        method: 'PUT',
        body: request,
      })
      return response
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
