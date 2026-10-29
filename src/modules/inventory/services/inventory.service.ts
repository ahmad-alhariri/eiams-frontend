import type { ApiTransport } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'
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
import { pathWithId } from '@/shared/services/api-path'

const INVENTORY_BALANCES_PATH = '/inventory/balances'
const INVENTORY_BALANCE_PATH = '/inventory/balances/{balanceId}'
const STOCK_MOVEMENTS_PATH = '/inventory/movements'
const STOCK_MOVEMENT_PATH = '/inventory/movements/{movementId}'

/**
 * Sends a list query through the ONE shared pagination clamp.
 *
 * `listBalances` / `listMovements` used to forward their query object
 * verbatim, and the issue-balance hook built `{ page: 0, pageSize: 1 }` — so
 * the live read went out as `?page=0`, which the backend's
 * `PaginationQueryParameters.Page` (`[Range(1, 21474836)]`) rejects with 400
 * `REQUEST_VALIDATION_FAILED`. Clamping in the shared service means no call
 * site can express an out-of-range page at all; the remaining filters pass
 * through unchanged.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): Record<string, string | number | boolean | undefined> {
  const { page, pageSize, ...filters } = query
  return {
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  }
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
        query: withWirePagination(query),
      })
      return normalizePage(page) as InventoryBalancePage
    },
    async getBalance(balanceId) {
      const response = await transport.request<InventoryBalance>({
        path: pathWithId(INVENTORY_BALANCE_PATH, '{balanceId}', balanceId),
        method: 'GET',
      })
      return response
    },
    async listMovements(query) {
      const page = await transport.requestPage<StockMovement>({
        path: STOCK_MOVEMENTS_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
      return normalizePage(page) as StockMovementPage
    },
    async getMovement(movementId) {
      const response = await transport.request<StockMovement>({
        path: pathWithId(STOCK_MOVEMENT_PATH, '{movementId}', movementId),
        method: 'GET',
      })
      return response
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Built at
// module evaluation, never as `{} as any` — that default is what made the
// first runtime list call throw. Replaced during tests by `setInventoryService`.
let inventoryService: InventoryService = createInventoryService(apiTransport)

export function setInventoryService(transport: ApiTransport) {
  inventoryService = createInventoryService(transport)
}

export { inventoryService }
