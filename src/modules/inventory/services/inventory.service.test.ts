import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createInventoryService } from '@/modules/inventory/services/inventory.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { StockMovement } from '@/shared/types/generated/eiams-v1'
import {
  createInventoryBalance,
  createNamedReference,
  createPage,
  createProblemDetails,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createInventoryService(bundle.client)
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

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

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
        lowStockState: 'Low',
        materialId: balance.material.id,
        pageIndex: 2,
        pageSize: 25,
        search: 'حاسوب',
        sortBy: 'Quantity',
        sortDirection: 'Descending',
        warehouseId: balance.warehouse.id,
      }),
    ).resolves.toEqual(createPage([balance]))
    await expect(
      service.listMovements({
        dateFrom: '2026-08-01T00:00:00.000Z',
        dateTo: '2026-08-31T23:59:59.000Z',
        documentId: movement.documentId,
        materialId: movement.material.id,
        movementType: 'Receipt',
        pageIndex: 1,
        pageSize: 50,
        sortBy: 'QuantityDelta',
        sortDirection: 'Ascending',
        warehouseId: movement.warehouse.id,
      }),
    ).resolves.toEqual(createPage([movement]))

    expect(requestedQueries).toEqual([
      {
        lowStockState: 'Low',
        materialId: balance.material.id,
        pageIndex: '2',
        pageSize: '25',
        search: 'حاسوب',
        sortBy: 'Quantity',
        sortDirection: 'Descending',
        warehouseId: balance.warehouse.id,
      },
      {
        dateFrom: '2026-08-01T00:00:00.000Z',
        dateTo: '2026-08-31T23:59:59.000Z',
        documentId: movement.documentId,
        materialId: movement.material.id,
        movementType: 'Receipt',
        pageIndex: '1',
        pageSize: '50',
        sortBy: 'QuantityDelta',
        sortDirection: 'Ascending',
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
    const problem = createProblemDetails({
      code: 'inventory.balance.not_found',
      detailAr: 'تعذر العثور على رصيد المخزون.',
      status: 404,
      titleAr: 'الرصيد غير موجود',
    })

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/missing`, () =>
        HttpResponse.json(problem, { status: 404 }),
      ),
    )

    const error = await service.getBalance('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      code: 'inventory.balance.not_found',
      detailAr: 'تعذر العثور على رصيد المخزون.',
      status: 404,
      titleAr: 'الرصيد غير موجود',
    })
  })
})
