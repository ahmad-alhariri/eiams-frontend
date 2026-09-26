import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { afterEach, describe, expect, it } from 'vitest'

import { createWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createWarehouse,
  createWarehouseCapability,
  createWarehouseMaterialSetting,
  createProblemDetails,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const BASE_URL = 'http://localhost/api/v1'
const bundles: ApiClientBundle[] = []

function envelopeSuccess<T>(
  data: T,
  pagination?: { page?: number; pageSize?: number; totalItems?: number; totalPages?: number; hasPreviousPage?: boolean; hasNextPage?: boolean },
): { success: true; data: T; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean } | null; meta: { requestId: string; timestampUtc: string } } {
  const isList = Array.isArray(data)
  const items = isList ? (data as unknown as readonly unknown[]) : [data]
  const totalItems = pagination?.totalItems ?? items.length
  const totalPages = pagination?.totalPages ?? (totalItems === 0 ? 0 : 1)
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? Math.max(items.length, 1)
  const hasPreviousPage = pagination?.hasPreviousPage ?? page > 1
  const hasNextPage = pagination?.hasNextPage ?? page < totalPages
  const single = !isList
  return {
    success: true,
    data: single ? (data as T) : (data as unknown as T),
    pagination: !pagination ? null : { page, pageSize, totalItems, totalPages, hasPreviousPage, hasNextPage },
    meta: { requestId: 'test-req-1', timestampUtc: '2026-09-15T12:00:00.000Z' },
  }
}

function pageOf<T>(
  items: readonly T[],
  page = 1,
  pageSize = items.length || 20,
  totalItems = items.length,
  totalPages = totalItems === 0 ? 0 : 1,
  hasPreviousPage = page > 1,
  hasNextPage = page < totalPages,
): { items: readonly T[]; meta: { pageIndex: number; page: number; pageSize: number; itemCount: number; totalItems: number; totalCount: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } } {
  return {
    items,
    meta: {
      pageIndex: page,
      page,
      pageSize,
      itemCount: totalItems,
      totalItems,
      totalCount: totalItems,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    },
  }
}

function setupService() {
  const bundle = createApiClient({ baseURL: BASE_URL })
  bundles.push(bundle)
  return createWarehouseService(createAxiosTransport(bundle.client))
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('WarehouseService', () => {
  const warehouseId = fixtureUuid(30)
  const materialId = fixtureUuid(20)
  const siteId = fixtureUuid(10)

  // Generated Warehouse type uses `site` (NamedReference), not `siteId` or `active`
  const warehouse = createWarehouse({
    warehouseId,
    code: 'WH-001',
    nameAr: 'المستودع الرئيسي',
    site: { id: siteId, displayName: 'المقر الرئيسي' },
  })
  const capability = createWarehouseCapability({
    domainId: fixtureUuid(20),
    domain: { id: fixtureUuid(20), displayName: 'تقنية المعلومات' },
    operations: ['Receiving', 'Issue'],
  })
  const setting = createWarehouseMaterialSetting({
    warehouseId,
    materialId,
    material: { id: materialId, displayName: 'حاسوب مكتبي' },
    minQuantity: 5,
    maxQuantity: 50,
  })

  it('maps warehouse and material-setting list filters to the generated contract endpoints', async () => {
    const service = setupService()
    const requestedUrls: string[] = []
    const requestedQueries: Record<string, string>[] = []

    server.use(
      http.get(`http://localhost/api/v1/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        requestedQueries.push(Object.fromEntries(url.searchParams))
        return HttpResponse.json(
          envelopeSuccess([warehouse], { page: 2, pageSize: 10, totalItems: 1, totalPages: 1 }),
        )
      }),
      http.get(
        `http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}/material-settings`,
        ({ request }) => {
          const url = new URL(request.url)
          requestedUrls.push(url.pathname + url.search)
          requestedQueries.push(Object.fromEntries(url.searchParams))
          return HttpResponse.json(
            envelopeSuccess([setting], { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }),
          )
        },
      ),
    )

    await expect(
      service.listWarehouses({ page: 2, pageSize: 10, siteId, status: 'Active' }),
    ).resolves.toEqual(pageOf([warehouse], 2, 10, 1, 1))
    await expect(
      service.listWarehouseMaterialSettings(warehouseId, { page: 1, pageSize: 25, search: 'حاسوب' }),
    ).resolves.toEqual(pageOf([setting], 1, 25, 1, 1))

    expect(requestedUrls).toEqual([
      '/api/v1/warehouses?page=2&pageSize=10&siteId=' + encodeURIComponent(siteId) + '&status=Active',
      '/api/v1/warehouses/' + encodeURIComponent(warehouseId) + '/material-settings?page=1&pageSize=25&search=' + encodeURIComponent('حاسوب'),
    ])
    expect(requestedQueries).toEqual([
      { page: '2', pageSize: '10', siteId, status: 'Active' },
      { page: '1', pageSize: '25', search: 'حاسوب' },
    ])
  })

  it('uses encoded identifiers and forwards generated write requests unchanged', async () => {
    const service = setupService()
    const receivedBodies: unknown[] = []

    const warehouseRequest = {
      siteId,
      code: 'WH-NEW',
      nameAr: 'مستودع جديد',
      rowVersion: 1,
      status: 'Active' as const,
    }
    const capabilitiesRequest = {
      domainId: fixtureUuid(20),
      operations: ['Receiving', 'Issue'] as const,
      rowVersion: 1,
      warehouseId,
    }
    const settingRequest: WarehouseMaterialSettingUpsertRequest = {
      warehouseId,
      materialId,
      rowVersion: 1,
      status: 'Active' as const,
      minQuantity: 5,
      maxQuantity: 50,
    }

    server.use(
      http.get(`http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}`, () =>
        HttpResponse.json(envelopeSuccess(warehouse)),
      ),
      http.post(`http://localhost/api/v1/warehouses`, async ({ request }) => {
        const body = await request.json() as typeof warehouseRequest
        receivedBodies.push(body)
        return HttpResponse.json(envelopeSuccess({
          ...warehouse,
          ...body,
          warehouseId,
          rowVersion: 1,
        }), { status: 201 })
      }),
      http.put(`http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}`, async ({ request }) => {
        const body = await request.json() as typeof warehouseRequest
        receivedBodies.push(body)
        return HttpResponse.json(envelopeSuccess({
          ...warehouse,
          ...body,
          warehouseId,
          rowVersion: 1,
        }), { status: 200 })
      }),
      http.get(`http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}/capabilities`, () =>
        HttpResponse.json(envelopeSuccess([capability])),
      ),
      http.put(
        `http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}/capabilities`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(envelopeSuccess([capability]), { status: 200 })
        },
      ),
      http.put(
        `http://localhost/api/v1/warehouses/${encodeURIComponent(warehouseId)}/material-settings`,
        async ({ request }) => {
          const body = await request.json() as typeof settingRequest
          receivedBodies.push(body)
          return HttpResponse.json(envelopeSuccess({
            ...body,
            warehouseId,
            rowVersion: 1,
          }), { status: 200 })
        },
      ),
    )

    await expect(service.getWarehouse(warehouseId)).resolves.toEqual(warehouse)
    await expect(
      service.createWarehouse(warehouseRequest),
    ).resolves.toMatchObject({
      siteId: warehouseRequest.siteId,
      code: warehouseRequest.code,
      nameAr: warehouseRequest.nameAr,
      status: warehouseRequest.status,
    })
    await expect(
      service.updateWarehouse(warehouseId, warehouseRequest),
    ).resolves.toMatchObject({
      siteId: warehouseRequest.siteId,
      code: warehouseRequest.code,
      nameAr: warehouseRequest.nameAr,
      status: warehouseRequest.status,
    })
    await expect(service.getWarehouseCapabilities(warehouseId)).resolves.toEqual([capability])
    await expect(
      service.createWarehouseCapability(capabilitiesRequest),
    ).resolves.toEqual(capabilitiesRequest)
    await expect(
      service.createWarehouseMaterialSetting(settingRequest),
    ).resolves.toEqual(settingRequest)

    expect(receivedBodies).toEqual([
      warehouseRequest,
      warehouseRequest,
      capabilitiesRequest,
      settingRequest,
    ])
  })

  it('leaves contract conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`http://localhost/api/v1/warehouses/missing`, () =>
        HttpResponse.json(
          createProblemDetails({
            code: 'warehouse.stale',
            titleAr: 'تم تعديل المستودع من قبل مستخدم آخر.',
            detailAr: 'يرجى تحديث البيانات وإعادة المحاولة.',
            status: 409,
          }),
          { status: 409 },
        ),
      ),
    )

    const error = await service.getWarehouse('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({ status: 409, code: 'warehouse.stale' })
  })
})
