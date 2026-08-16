import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createPage,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseMaterialSetting,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createWarehouseService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('WarehouseService', () => {
  it('maps warehouse and material-setting list filters to the generated contract endpoints', async () => {
    const service = setupService()
    const warehouse = createWarehouse()
    const setting = createWarehouseMaterialSetting()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        return HttpResponse.json(createPage([warehouse]))
      }),
      http.get(
        `${API_BASE_URL}/warehouses/${warehouse.warehouseId}/material-settings`,
        ({ request }) => {
          const url = new URL(request.url)
          requestedUrls.push(url.pathname + url.search)
          return HttpResponse.json(createPage([setting]))
        },
      ),
    )

    await expect(
      service.listWarehouses({
        pageIndex: 2,
        pageSize: 10,
        siteId: warehouse.site.id,
        status: 'Active',
      }),
    ).resolves.toEqual(createPage([warehouse]))
    await expect(
      service.listWarehouseMaterialSettings(warehouse.warehouseId, {
        pageIndex: 1,
        pageSize: 25,
        search: 'حاسوب',
      }),
    ).resolves.toEqual(createPage([setting]))

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/warehouses?pageIndex=2&pageSize=10&siteId=${warehouse.site.id}&status=Active`,
      `${API_BASE_URL}/warehouses/${warehouse.warehouseId}/material-settings?pageIndex=1&pageSize=25&search=%D8%AD%D8%A7%D8%B3%D9%88%D8%A8`,
    ])
  })

  it('uses encoded identifiers and forwards generated write requests unchanged', async () => {
    const service = setupService()
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability()
    const setting = createWarehouseMaterialSetting()
    const warehouseId = 'warehouse / دمشق'
    const receivedBodies: unknown[] = []
    const warehouseRequest = {
      siteId: warehouse.site.id,
      code: warehouse.code,
      nameAr: warehouse.nameAr,
      rowVersion: warehouse.rowVersion,
      status: warehouse.status,
      ...(warehouse.locationAr === undefined ? {} : { locationAr: warehouse.locationAr }),
    }
    const capabilitiesRequest = [
      {
        domainId: capability.domain.id,
        operations: capability.operations,
        rowVersion: capability.rowVersion,
      },
    ]
    const settingRequest = {
      materialId: setting.material.id,
      rowVersion: setting.rowVersion,
      status: setting.status,
      ...(setting.minQuantity === undefined ? {} : { minQuantity: setting.minQuantity }),
      ...(setting.maxQuantity === undefined ? {} : { maxQuantity: setting.maxQuantity }),
    }

    server.use(
      http.get(`${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(warehouse, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(warehouse)
        },
      ),
      http.get(`${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/capabilities`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json([capability])
        },
      ),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/material-settings`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(setting)
        },
      ),
    )

    await expect(service.getWarehouse(warehouseId)).resolves.toEqual(warehouse)
    await expect(service.createWarehouse(warehouseRequest)).resolves.toEqual(warehouse)
    await expect(service.updateWarehouse(warehouseId, warehouseRequest)).resolves.toEqual(warehouse)
    await expect(service.getWarehouseCapabilities(warehouseId)).resolves.toEqual([capability])
    await expect(
      service.replaceWarehouseCapabilities(warehouseId, capabilitiesRequest),
    ).resolves.toEqual([capability])
    await expect(
      service.upsertWarehouseMaterialSetting(warehouseId, settingRequest),
    ).resolves.toEqual(setting)

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
      http.get(`${API_BASE_URL}/warehouses/missing`, () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'warehouse.stale',
            titleAr: 'تم تعديل المستودع من مستخدم آخر.',
          },
          { status: 409 },
        ),
      ),
    )

    const error = await service.getWarehouse('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({ status: 409, code: 'warehouse.stale' })
  })
})
