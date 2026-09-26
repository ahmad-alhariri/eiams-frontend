import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { afterEach, describe, expect, it } from 'vitest'

import { inventoryService, setInventoryService } from '@/modules/inventory/services/inventory.service'
import { normalizeError } from '@/shared/services/api.client'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createInventoryBalance,
  createStockMovement,
  createProblemDetails,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = 'http://localhost/api/v1'
const bundles: ApiClientBundle[] = []

function envelopeSuccess<T>(
  data: T,
  pagination?: { page?: number; pageSize?: number; totalItems?: number; totalPages?: number; hasPreviousPage?: boolean; hasNextPage?: boolean },
): { success: true; data: T; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean } | null; meta: { requestId: string; timestampUtc: string } } {
  const pageData = Array.isArray(data)
  const items = pageData ? (data as unknown as readonly unknown[]) : [data]
  const totalItems = pagination?.totalItems ?? items.length
  const totalPages = pagination?.totalPages ?? (totalItems === 0 ? 0 : 1)
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? Math.max(items.length, 1)
  const hasPreviousPage = pagination?.hasPreviousPage ?? page > 1
  const hasNextPage = pagination?.hasNextPage ?? page < totalPages
  const singleItem = !pageData
  return {
    success: true,
    data: singleItem ? (data as T) : (data as unknown as T),
    pagination: !pagination
      ? null
      : { page, pageSize, totalItems, totalPages, hasPreviousPage, hasNextPage },
    meta: { requestId: 'test-req-1', timestampUtc: '2026-09-15T12:00:00.000Z' },
  }
}

function apiPage<T>(
  items: readonly T[],
  page = 1,
  pageSize = items.length || 20,
  totalItems = items.length,
  totalPages = totalItems === 0 ? 0 : 1,
  hasPreviousPage = page > 1,
  hasNextPage = page < totalPages,
): { items: readonly T[]; page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean } {
  return { items, page, pageSize, totalItems, totalPages, hasPreviousPage, hasNextPage }
}

function normalizePageShape<T>(
  page: { items: readonly T[]; page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean },
): { items: readonly T[]; meta: { page: number; pageIndex: number; pageSize: number; itemCount: number; totalItems: number; totalCount: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean } } {
  return {
    items: page.items,
    meta: {
      page: page.page,
      pageIndex: page.page,
      pageSize: page.pageSize,
      itemCount: page.totalItems,
      totalItems: page.totalItems,
      totalCount: page.totalItems,
      totalPages: page.totalPages,
      hasPreviousPage: page.hasPreviousPage,
      hasNextPage: page.hasNextPage,
    },
  }
}

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  setInventoryService(createAxiosTransport(bundle.client))
  return inventoryService
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
      http.get(`http://localhost/api/v1/inventory/balances`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(envelopeSuccess([balance], { page: 2, pageSize: 25, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/inventory/movements`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(envelopeSuccess([movement], { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 }))
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
    ).resolves.toEqual(normalizePageShape(apiPage([balance], 2, 25, 1, 1)))
    await expect(
      service.listMovements({
        documentId: movement.documentId,
        materialId: movement.material.id,
        movementType: 'Receipt',
        page: 1,
        pageSize: 50,
        warehouseId: movement.warehouse.id,
      }),
    ).resolves.toEqual(normalizePageShape(apiPage([movement], 1, 50, 1, 1)))

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
      http.get(`http://localhost/api/v1/inventory/balances/${encodeURIComponent(balanceId)}`, () =>
        HttpResponse.json(envelopeSuccess(balance)),
      ),
      http.get(`http://localhost/api/v1/inventory/movements/${encodeURIComponent(movementId)}`, () =>
        HttpResponse.json(envelopeSuccess(movement)),
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
      http.get(`http://localhost/api/v1/inventory/balances/missing`, () =>
        HttpResponse.json(problem, { status: 404 }),
      ),
    )

    const error = await service.getBalance('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeError(error)).toMatchObject({
      code: 'inventory.balance.not_found',
      detailAr: 'تعذر العثور على رصيد المخزون.',
      status: 404,
      titleAr: 'الرصيد غير موجود',
    })
  })
})
