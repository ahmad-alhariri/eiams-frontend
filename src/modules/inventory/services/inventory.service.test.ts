import axios from 'axios'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  inventoryService,
  setInventoryService,
} from '@/modules/inventory/services/inventory.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { wireInventoryBalance, wireStockMovement } from '@/test/msw/inventory-wire-fixtures'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

// A real transport over a real Axios client (9uuf); the previous cast supplied
// none of requestPage/request/requestEmpty while satisfying the type.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  setInventoryService(transport)
  return inventoryService
}

/**
 * The page the service NORMALIZES to: `requestPage` unwraps the wire
 * `pagination` block into `ApiPage`, and `normalizePage` re-projects it onto the
 * module's wider `PageMeta`. The generated `createPage([item])` the previous
 * expectations compared against (`{items, meta:{pageIndex,pageSize,totalItems,
 * totalPages}}`) describes neither the wire nor the result — an expectation
 * written against it can only be satisfied by a transport that stopped
 * unwrapping — so the real normalized shape is spelled out here.
 */
function normalizedPage<T>(
  items: readonly T[],
  pagination: { page: number; pageSize: number; totalItems: number },
) {
  return {
    items,
    meta: {
      page: pagination.page,
      pageIndex: pagination.page,
      pageSize: pagination.pageSize,
      itemCount: pagination.totalItems,
      totalItems: pagination.totalItems,
      totalCount: pagination.totalItems,
      totalPages: pagination.totalItems === 0 ? 0 : 1,
      hasNextPage: false,
      hasPreviousPage: pagination.page > 1,
    },
  }
}

describe('InventoryService', () => {
  it('forwards contracted balance and movement filters and server ordering unchanged', async () => {
    const service = setupService()
    const balance = wireInventoryBalance()
    const movement = wireStockMovement()
    const requestedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([balance], { page: 2, pageSize: 25, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([movement], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
      }),
    )

    await expect(
      service.listBalances({
        materialId: balance.materialId,
        page: 2,
        pageSize: 25,
        search: 'حاسوب',
        warehouseId: balance.warehouseId,
      }),
    ).resolves.toEqual(normalizedPage([balance], { page: 2, pageSize: 25, totalItems: 1 }))
    await expect(
      service.listMovements({
        documentId: movement.documentId,
        materialId: movement.materialId,
        movementType: 'Receipt',
        page: 1,
        pageSize: 50,
        warehouseId: movement.warehouseId,
      }),
    ).resolves.toEqual(normalizedPage([movement], { page: 1, pageSize: 50, totalItems: 1 }))

    expect(requestedQueries).toEqual([
      {
        materialId: balance.materialId,
        page: '2',
        pageSize: '25',
        search: 'حاسوب',
        warehouseId: balance.warehouseId,
      },
      {
        documentId: movement.documentId,
        materialId: movement.materialId,
        movementType: 'Receipt',
        page: '1',
        pageSize: '50',
        warehouseId: movement.warehouseId,
      },
    ])
  })

  it('encodes balance and movement identifiers and returns contract responses unchanged', async () => {
    const service = setupService()
    const balance = wireInventoryBalance()
    const movement = wireStockMovement()
    const balanceId = 'balance / دمشق'
    const movementId = 'movement / دمشق'

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/${encodeURIComponent(balanceId)}`, () =>
        okJson(balance),
      ),
      http.get(`${API_BASE_URL}/inventory/movements/${encodeURIComponent(movementId)}`, () =>
        okJson(movement),
      ),
    )

    const readMovement = await service.getMovement(movementId)
    await expect(service.getBalance(balanceId)).resolves.toEqual(balance)
    expect(readMovement).toEqual(movement)
    // `postedBy` is a UUID STRING on the wire — `StockMovementResponse.PostedBy`
    // is a `Guid` — so the detail page's `{movement.postedBy}` React child gets
    // a string. Serving the generated `NamedReference` here is what made React
    // throw "Objects are not valid as a React child".
    expect(typeof readMovement.postedBy).toBe('string')
  })

  it('preserves server failures for Arabic error normalization at the presentation boundary', async () => {
    const service = setupService()
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/missing`, () =>
        errJson(404, { code: 'INVENTORY_BALANCES_NOT_FOUND', message: 'Balance not found.' }),
      ),
    )

    const error = await service.getBalance('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      code: 'INVENTORY_BALANCES_NOT_FOUND',
      status: 404,
      titleAr: 'لم يتم العثور على رصيد المخزون.',
    })
  })
})
