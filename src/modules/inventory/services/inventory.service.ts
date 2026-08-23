import type { AxiosInstance } from 'axios'

import type {
  ListInventoryBalancesQuery,
  ListStockMovementsQuery,
} from '@/modules/inventory/types/inventory.types'
import { apiClient } from '@/shared/services/api.client'
import type {
  InventoryBalance,
  InventoryBalancePage,
  paths,
  StockMovement,
  StockMovementPage,
} from '@/shared/types/generated/eiams-v1'

const INVENTORY_BALANCES_PATH = '/inventory/balances' satisfies keyof paths
const INVENTORY_BALANCE_PATH = '/inventory/balances/{balanceId}' satisfies keyof paths
const STOCK_MOVEMENTS_PATH = '/inventory/movements' satisfies keyof paths
const STOCK_MOVEMENT_PATH = '/inventory/movements/{movementId}' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface InventoryService {
  listBalances: (query: ListInventoryBalancesQuery) => Promise<InventoryBalancePage>
  getBalance: (balanceId: string) => Promise<InventoryBalance>
  listMovements: (query: ListStockMovementsQuery) => Promise<StockMovementPage>
  getMovement: (movementId: string) => Promise<StockMovement>
}

/**
 * Contract-only inventory reads. Scope, permission, ordering, low-stock state,
 * and ledger provenance remain server-authoritative.
 */
export function createInventoryService(client: AxiosInstance): InventoryService {
  return {
    async listBalances(query) {
      const response = await client.get<InventoryBalancePage>(INVENTORY_BALANCES_PATH, {
        params: query,
      })
      return response.data
    },
    async getBalance(balanceId) {
      const response = await client.get<InventoryBalance>(
        pathWithId(INVENTORY_BALANCE_PATH, '{balanceId}', balanceId),
      )
      return response.data
    },
    async listMovements(query) {
      const response = await client.get<StockMovementPage>(STOCK_MOVEMENTS_PATH, { params: query })
      return response.data
    },
    async getMovement(movementId) {
      const response = await client.get<StockMovement>(
        pathWithId(STOCK_MOVEMENT_PATH, '{movementId}', movementId),
      )
      return response.data
    },
  }
}

export const inventoryService = createInventoryService(apiClient)
