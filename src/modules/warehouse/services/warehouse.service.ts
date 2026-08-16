import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type {
  paths,
  Warehouse,
  WarehouseCapability,
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSetting,
  WarehouseMaterialSettingPage,
  WarehouseMaterialSettingUpsertRequest,
  WarehousePage,
  WarehouseUpsertRequest,
} from '@/shared/types/generated/eiams-v1'
import type {
  ListWarehouseMaterialSettingsQuery,
  ListWarehousesQuery,
} from '@/modules/warehouse/types/warehouse.types'

const WAREHOUSES_PATH = '/warehouses' satisfies keyof paths
const WAREHOUSE_PATH = '/warehouses/{warehouseId}' satisfies keyof paths
const WAREHOUSE_CAPABILITIES_PATH = '/warehouses/{warehouseId}/capabilities' satisfies keyof paths
const WAREHOUSE_MATERIAL_SETTINGS_PATH =
  '/warehouses/{warehouseId}/material-settings' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
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

/**
 * Contract-only warehouse transport. The API remains authoritative for active
 * scope, permissions, capability rules, and optimistic-concurrency conflicts.
 */
export function createWarehouseService(client: AxiosInstance): WarehouseService {
  return {
    async listWarehouses(query) {
      const response = await client.get<WarehousePage>(WAREHOUSES_PATH, { params: query })
      return response.data
    },
    async getWarehouse(warehouseId) {
      const response = await client.get<Warehouse>(
        pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
      )
      return response.data
    },
    async createWarehouse(request) {
      const response = await client.post<Warehouse>(WAREHOUSES_PATH, request)
      return response.data
    },
    async updateWarehouse(warehouseId, request) {
      const response = await client.put<Warehouse>(
        pathWithId(WAREHOUSE_PATH, '{warehouseId}', warehouseId),
        request,
      )
      return response.data
    },
    async getWarehouseCapabilities(warehouseId) {
      const response = await client.get<readonly WarehouseCapability[]>(
        pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
      )
      return response.data
    },
    async replaceWarehouseCapabilities(warehouseId, request) {
      const response = await client.put<readonly WarehouseCapability[]>(
        pathWithId(WAREHOUSE_CAPABILITIES_PATH, '{warehouseId}', warehouseId),
        request,
      )
      return response.data
    },
    async listWarehouseMaterialSettings(warehouseId, query) {
      const response = await client.get<WarehouseMaterialSettingPage>(
        pathWithId(WAREHOUSE_MATERIAL_SETTINGS_PATH, '{warehouseId}', warehouseId),
        { params: query },
      )
      return response.data
    },
    async upsertWarehouseMaterialSetting(warehouseId, request) {
      const response = await client.put<WarehouseMaterialSetting>(
        pathWithId(WAREHOUSE_MATERIAL_SETTINGS_PATH, '{warehouseId}', warehouseId),
        request,
      )
      return response.data
    },
  }
}

export const warehouseService = createWarehouseService(apiClient)
