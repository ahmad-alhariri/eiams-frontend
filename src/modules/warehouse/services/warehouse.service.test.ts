import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'
import { normalizeApiError } from '@/shared/services/api-error'
import { createWarehouseCapability, createWarehouseMaterialSetting } from '@/test/msw/factories'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

const WAREHOUSE_ID = '3a1f0c62-6d4b-4a7e-9c1d-8b2e5f7a0d31'
const SITE_ID = '7c4e2b18-9f35-4c62-b0a8-5d1e3f6c8a94'
const ORG_UNIT_ID = 'b58d1f70-2a64-4e93-8f07-1c6b9d3e5f20'

/**
 * A warehouse in the REAL wire shape, built locally instead of through the
 * shared `createWarehouse` factory: that factory still returns the fiction
 * (`warehouseId` / `nameAr` / `locationAr` / nested `site`), and a fixture
 * that the production response could never produce is exactly what kept this
 * suite green against the wrong contract.
 */
function wireWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: WAREHOUSE_ID,
    siteId: SITE_ID,
    organizationalUnitId: ORG_UNIT_ID,
    name: 'المستودع المركزي',
    code: 'WH-CENTRAL',
    warehouseType: 'Storage',
    canHoldStock: true,
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

// A real transport over a real Axios client (9uuf). This suite built a service
// directly rather than through the singleton, so it never exercised
// `setWarehouseService` at all — which is part of why the module's three
// competing singletons went unnoticed.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService(): ReturnType<typeof createWarehouseService> {
  const { transport } = createHarness()
  return createWarehouseService(transport)
}

describe('WarehouseService', () => {
  it('maps warehouse and material-setting list filters to the wire endpoints', async () => {
    const service = setupService()
    const warehouse = wireWarehouse()
    const setting = createWarehouseMaterialSetting()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        return okPageJson([warehouse])
      }),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        return okPageJson([setting])
      }),
    )

    // The fixtures serve the WIRE envelope (`okPageJson`) rather than a UI page.
    const warehousePage = await service.listWarehouses({
      page: 2,
      pageSize: 10,
      siteId: warehouse.siteId,
      status: 'Active',
    })
    expect(warehousePage.items).toEqual([warehouse])

    const settingsPage = await service.listWarehouseMaterialSettings(warehouse.id, {
      page: 1,
      pageSize: 25,
      search: 'حاسوب',
    })
    expect(settingsPage.items).toEqual([setting])

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/warehouses?page=2&pageSize=10&siteId=${SITE_ID}&status=Active`,
      `${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/material-settings?page=1&pageSize=25&search=%D8%AD%D8%A7%D8%B3%D9%88%D8%A8`,
    ])
  })

  it('reads a warehouse through the flat wire shape: id/siteId/name, no nameAr or nested site', async () => {
    const service = setupService()
    const warehouse = wireWarehouse({ rowVersion: 4 })

    server.use(http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () => okJson(warehouse)))

    const read = await service.getWarehouse(WAREHOUSE_ID)

    expect(read).toEqual(warehouse)
    // The projection carries these nine keys and nothing else. The old fixture
    // asserted `warehouseId` / `nameAr` / `locationAr` / `site`, none of which
    // the backend serves.
    expect(Object.keys(read).sort()).toEqual([
      'canHoldStock',
      'code',
      'id',
      'name',
      'organizationalUnitId',
      'rowVersion',
      'siteId',
      'status',
      'warehouseType',
    ])
    expect(read.name).toBe('المستودع المركزي')
    expect(read).not.toHaveProperty('nameAr')
    expect(read).not.toHaveProperty('warehouseId')
    expect(read).not.toHaveProperty('site')
  })

  it('sends the exact create body and the exact update body, and returns no payload on update', async () => {
    const service = setupService()
    const warehouse = wireWarehouse({ rowVersion: 7 })
    const capability = createWarehouseCapability()
    const setting = createWarehouseMaterialSetting()
    const warehouseId = 'warehouse / دمشق'
    const receivedBodies: unknown[] = []

    // POST binds siteId/organizationalUnitId/name/code/warehouseType/canHoldStock.
    const createRequest = {
      siteId: warehouse.siteId,
      organizationalUnitId: warehouse.organizationalUnitId ?? ORG_UNIT_ID,
      name: warehouse.name,
      code: warehouse.code,
      warehouseType: warehouse.warehouseType,
      canHoldStock: warehouse.canHoldStock,
    }
    // PUT binds organizationalUnitId/name/warehouseType/canHoldStock plus the
    // concurrency token. `siteId` and `code` are create-only; `status` is on
    // neither body.
    const updateRequest = {
      organizationalUnitId: warehouse.organizationalUnitId ?? ORG_UNIT_ID,
      name: 'المستودع المركزي المحدَّث',
      warehouseType: warehouse.warehouseType,
      canHoldStock: false,
      expectedRowVersion: warehouse.rowVersion,
    }
    const capabilitiesRequest = [
      {
        warehouseId: capability.warehouseId,
        domainId: capability.domainId,
        operations: capability.operations,
        rowVersion: capability.rowVersion,
      },
    ]
    // The material-setting body carries NO `warehouseId`: the route already names
    // the warehouse (`PUT /warehouses/{warehouseId}/material-settings`) and the
    // request contract omits it.
    const settingRequest: Parameters<typeof service.upsertWarehouseMaterialSetting>[1] = {
      materialId: setting.materialId,
      rowVersion: setting.rowVersion,
      status: setting.status,
      ...(setting.minQuantity === undefined ? {} : { minQuantity: setting.minQuantity }),
      ...(setting.maxQuantity === undefined ? {} : { maxQuantity: setting.maxQuantity }),
    }

    server.use(
      http.get(`${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}`, () =>
        okJson(warehouse),
      ),
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        receivedBodies.push(await request.json())
        // POST returns only the new identifier.
        return apiJson({ id: WAREHOUSE_ID }, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          // PUT returns an EMPTY body — the old fixture answered with the whole
          // warehouse, which is what let `onSuccess: ({warehouseId}) => ...` look
          // safe at the type level while crashing at runtime.
          return new HttpResponse(null, { status: 204 })
        },
      ),
      http.get(`${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/capabilities`, () =>
        okJson([capability]),
      ),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/capabilities`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return okJson([capability])
        },
      ),
      http.put(
        `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/material-settings`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return okJson(setting)
        },
      ),
    )

    await expect(service.getWarehouse(warehouseId)).resolves.toEqual(warehouse)
    await expect(service.createWarehouse(createRequest)).resolves.toEqual({ id: WAREHOUSE_ID })
    await expect(service.updateWarehouse(warehouseId, updateRequest)).resolves.toBeUndefined()
    await expect(service.getWarehouseCapabilities(warehouseId)).resolves.toEqual([capability])
    await expect(
      service.replaceWarehouseCapabilities(warehouseId, capabilitiesRequest),
    ).resolves.toEqual([capability])
    await expect(
      service.upsertWarehouseMaterialSetting(warehouseId, settingRequest),
    ).resolves.toEqual(setting)

    expect(receivedBodies).toEqual([
      createRequest,
      updateRequest,
      capabilitiesRequest,
      settingRequest,
    ])

    const [sentCreate, sentUpdate] = receivedBodies as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(Object.keys(sentCreate).sort()).toEqual([
      'canHoldStock',
      'code',
      'name',
      'organizationalUnitId',
      'siteId',
      'warehouseType',
    ])
    expect(Object.keys(sentUpdate).sort()).toEqual([
      'canHoldStock',
      'expectedRowVersion',
      'name',
      'organizationalUnitId',
      'warehouseType',
    ])
    // `expectedRowVersion` is the value the read served as `rowVersion`,
    // verbatim. Normalising it to 0-based sends 0 and the validator rejects it
    // before the version comparison even runs.
    expect(sentUpdate['expectedRowVersion']).toBe(7)
    expect(sentUpdate['expectedRowVersion']).not.toBe(0)
    for (const body of [sentCreate, sentUpdate]) {
      expect(body).not.toHaveProperty('status')
      expect(body).not.toHaveProperty('nameAr')
      expect(body).not.toHaveProperty('locationAr')
      expect(body).not.toHaveProperty('rowVersion')
    }
    // Create-only identifiers must not ride along on the update.
    expect(sentUpdate).not.toHaveProperty('siteId')
    expect(sentUpdate).not.toHaveProperty('code')
  })

  it('leaves contract conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/warehouses/missing`, () =>
        errJson(409, {
          code: 'WAREHOUSES_CODE_NOT_UNIQUE',
          message: 'The Code field is already in use.',
        }),
      ),
    )

    const error = await service.getWarehouse('missing').catch((reason: unknown) => reason)

    // `code` is nested under `error` on the wire; the old fixture put it at the
    // top level of a hand-rolled body, so the normalizer resolved it to null.
    expect(normalizeApiError(error)).toMatchObject({
      status: 409,
      code: 'WAREHOUSES_CODE_NOT_UNIQUE',
    })
  })
})
