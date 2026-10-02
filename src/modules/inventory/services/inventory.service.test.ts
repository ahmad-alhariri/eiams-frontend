import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  inventoryService,
  setInventoryService,
} from '@/modules/inventory/services/inventory.service'
import { normalizeApiError } from '@/shared/services/api-error'
import type { StockMovement } from '@/shared/types/generated/eiams-v1'
import {
  createInventoryBalance,
  createNamedReference,
  createPage,
  fixtureUuid,
} from '@/test/msw/factories'
import { errJson } from '@/test/msw/envelope'
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

function createStockMovement(): StockMovement {
  return {
    documentId: fixtureUuid(60),
    documentLineId: fixtureUuid(61),
    documentReference: 'RCP-2026-0001',
    material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
    movementId: fixtureUuid(70),
    movementType: 'Receipt',
    postedAt: '2026-08-21T10:00:00.000Z',
    postedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
    quantityDelta: 5,
    warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
  }
}

describe('InventoryService', () => {
  it('forwards contracted balance and movement filters and server ordering unchanged', async () => {
    const service = setupService()
    const balance = createInventoryBalance()
    const movement = createStockMovement()
    const requestedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(createPage([balance]))
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(createPage([movement]))
      }),
    )

    await expect(
      service.listBalances({
        materialId: balance.material.id,
        page: 2,
        pageSize: 25,
        search: 'حاسوب',
        warehouseId: balance.warehouse.id,
      }),
    ).resolves.toEqual(createPage([balance]))
    await expect(
      service.listMovements({
        documentId: movement.documentId,
        materialId: movement.material.id,
        movementType: 'Receipt',
        page: 1,
        pageSize: 50,
        warehouseId: movement.warehouse.id,
      }),
    ).resolves.toEqual(createPage([movement]))

    expect(requestedQueries).toEqual([
      {
        materialId: balance.material.id,
        page: '2',
        pageSize: '25',
        search: 'حاسوب',
        warehouseId: balance.warehouse.id,
      },
      {
        documentId: movement.documentId,
        materialId: movement.material.id,
        movementType: 'Receipt',
        page: '1',
        pageSize: '50',
        warehouseId: movement.warehouse.id,
      },
    ])
  })

  it('encodes balance and movement identifiers and returns contract responses unchanged', async () => {
    const service = setupService()
    const balance = createInventoryBalance()
    const movement = createStockMovement()
    const balanceId = 'balance / دمشق'
    const movementId = 'movement / دمشق'

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/${encodeURIComponent(balanceId)}`, () =>
        HttpResponse.json(balance),
      ),
      http.get(`${API_BASE_URL}/inventory/movements/${encodeURIComponent(movementId)}`, () =>
        HttpResponse.json(movement),
      ),
    )

    await expect(service.getBalance(balanceId)).resolves.toEqual(balance)
    await expect(service.getMovement(movementId)).resolves.toEqual(movement)
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
