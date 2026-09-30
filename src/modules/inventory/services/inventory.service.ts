import type { ApiTransport } from '@/shared/api/api-transport'
import type { ApiPage } from '@/shared/api/api-contracts'
import type {
  InventoryBalance,
  InventoryBalancePage,
  StockMovement,
  StockMovementPage,
  ListInventoryBalancesQuery,
  ListStockMovementsQuery,
  PageMeta,
} from '@/modules/inventory/types/inventory.api-types'

const INVENTORY_BALANCES_PATH = '/inventory/balances'
const INVENTORY_BALANCE_PATH = '/inventory/balances/{balanceId}'
const STOCK_MOVEMENTS_PATH = '/inventory/movements'
const STOCK_MOVEMENT_PATH = '/inventory/movements/{movementId}'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

function normalizePage<T>(apiPage: ApiPage<T>): { items: ReadonlyArray<T>; meta: PageMeta } {
  return {
    items: apiPage.items,
    meta: {
      page: apiPage.page,
      pageIndex: apiPage.page,
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

export interface InventoryService {
  listBalances: (query: ListInventoryBalancesQuery) => Promise<InventoryBalancePage>
  getBalance: (balanceId: string) => Promise<InventoryBalance>
  listMovements: (query: ListStockMovementsQuery) => Promise<StockMovementPage>
  getMovement: (movementId: string) => Promise<StockMovement>
}

export function createInventoryService(transport: ApiTransport): InventoryService {
  return {
    async listBalances(query) {
      const page = await transport.requestPage<InventoryBalance>({
        path: INVENTORY_BALANCES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as InventoryBalancePage
    },
    async getBalance(balanceId) {
      const response = await transport.request<InventoryBalance>({
        path: pathWithId(INVENTORY_BALANCE_PATH, '{balanceId}', balanceId),
        method: 'GET',
      })
      return response.data
    },
    async listMovements(query) {
      const page = await transport.requestPage<StockMovement>({
        path: STOCK_MOVEMENTS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as StockMovementPage
    },
    async getMovement(movementId) {
      const response = await transport.request<StockMovement>({
        path: pathWithId(STOCK_MOVEMENT_PATH, '{movementId}', movementId),
        method: 'GET',
      })
      return response.data
    },
  }
}

// Lazy singleton — replaced during tests by `setInventoryService`.
let inventoryService: InventoryService = createInventoryService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function setInventoryService(transport: ApiTransport) {
  inventoryService = createInventoryService(transport)
}

export { inventoryService }
