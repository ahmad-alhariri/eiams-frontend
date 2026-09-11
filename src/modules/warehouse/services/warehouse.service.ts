import type { ApiTransport } from '@/shared/api/api-transport'
import type {
  Warehouse,
  WarehouseCapability,
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSetting,
  WarehouseMaterialSettingPage,
  WarehouseMaterialSettingUpsertRequest,
  WarehousePage,
  WarehouseUpsertRequest,
  ListWarehousesQuery,
  ListWarehouseMaterialSettingsQuery,
} from '@/modules/warehouse/types/warehouse.api-types'
import type { ApiPage } from '@/shared/api/api-contracts'

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
  createWarehouse: (request: WarehouseUpsertRequest) => Promise<Warehouse>
  updateWarehouse: (warehouseId: string, request: WarehouseUpsertRequest) => Promise<Warehouse>
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
      return response.data
    },

    async createWarehouse(request) {
      const response = await transport.request<Warehouse>({
        path: WAREHOUSES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateWarehouse(warehouseId, request) {
      const response = await transport.request<Warehouse>({
        path: pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async getWarehouseCapabilities(warehouseId) {
      const response = await transport.request<readonly WarehouseCapability[]>({
        path: pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        method: 'GET',
      })
      return response.data
    },

    async replaceWarehouseCapabilities(warehouseId, request) {
      const response = await transport.request<readonly WarehouseCapability[]>({
        path: pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        method: 'PUT',
        body: request,
      })
      return response.data
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
      return response.data
    },
  }
}

// Lazy singleton — replaced during tests by `setWarehouseService`.
let warehouseService: WarehouseService = createWarehouseService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function setWarehouseService(transport: ApiTransport) {
  warehouseService = createWarehouseService(transport)
}

export { warehouseService }
