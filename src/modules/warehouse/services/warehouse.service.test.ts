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
const CAPABILITY_ID = '6c7f0a14-2b4d-4f08-9b9d-1d1c1d1d1d1d'
const SETTING_ID = '5d6e7f80-1a2b-3c4d-5e6f-7a8b9c0d1e2f'

/**
 * A warehouse in the real wire shape: siteId, organizationalUnitId, name,
 * code, warehouseType, canHoldStock, status, rowVersion. Built locally
 * instead of via the shared `createWarehouse` factory only so this test
 * can pin every field by name.
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

  it('clamps a zero-based page and an over-large page size before the wire (F-05)', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        requestedUrls.push(new URL(request.url).search)
        return okPageJson([])
      }),
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/material-settings`, ({ request }) => {
        requestedUrls.push(new URL(request.url).search)
        return okPageJson([])
      }),
    )

    // The backend binds `PaginationQueryParameters.Page` as `[Range(1, …)]` and
    // rejects page=0 with 400, so the shared clamp must floor it to 1 and cap an
    // over-large page size at the wire maximum (100).
    await service.listWarehouses({ page: 0, pageSize: 500 })
    await service.listWarehouseMaterialSettings(WAREHOUSE_ID, { page: 0, pageSize: 0 })

    expect(requestedUrls).toEqual(['?page=1&pageSize=100', '?page=1&pageSize=1'])
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
    )

    await expect(service.getWarehouse(warehouseId)).resolves.toEqual(warehouse)
    await expect(service.createWarehouse(createRequest)).resolves.toEqual({ id: WAREHOUSE_ID })
    await expect(service.updateWarehouse(warehouseId, updateRequest)).resolves.toBeUndefined()

    expect(receivedBodies).toEqual([createRequest, updateRequest])

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

  it('binds capability grants, revokes, and per-operation add/remove to the live wire', async () => {
    const service = setupService()
    const capability = createWarehouseCapability({ id: CAPABILITY_ID, warehouseId: WAREHOUSE_ID })
    const receivedBodies: Array<{ url: string; method: string; body: unknown }> = []

    server.use(
      http.post(`${API_BASE_URL}/warehouse-capabilities`, async ({ request }) => {
        receivedBodies.push({ url: request.url, method: 'POST', body: await request.json() })
        return apiJson({ id: CAPABILITY_ID }, { status: 201 })
      }),
      http.delete(`${API_BASE_URL}/warehouse-capabilities/${CAPABILITY_ID}`, () => {
        receivedBodies.push({ url: `${CAPABILITY_ID}`, method: 'DELETE', body: undefined })
        return new HttpResponse(null, { status: 200 })
      }),
      http.post(
        `${API_BASE_URL}/warehouse-capabilities/${CAPABILITY_ID}/operations`,
        async ({ request }) => {
          receivedBodies.push({ url: request.url, method: 'POST', body: await request.json() })
          return apiJson({ id: `${CAPABILITY_ID}-op` }, { status: 201 })
        },
      ),
      http.delete(
        `${API_BASE_URL}/warehouse-capabilities/${CAPABILITY_ID}/operations/Adjustment`,
        () => {
          receivedBodies.push({
            url: `${CAPABILITY_ID}/operations/Adjustment`,
            method: 'DELETE',
            body: undefined,
          })
          return new HttpResponse(null, { status: 200 })
        },
      ),
    )

    await expect(
      service.grantWarehouseCapability({
        warehouseId: WAREHOUSE_ID,
        materialDomainId: capability.materialDomainId,
      }),
    ).resolves.toEqual({ id: CAPABILITY_ID })
    await expect(service.revokeWarehouseCapability(CAPABILITY_ID)).resolves.toBeUndefined()
    // addOperation sends the INT ordinal 0..5 (Adjustment=5) — encoded via
    // operationOrdinal so the asymmetry is captured in one place.
    await expect(
      service.addWarehouseCapabilityOperation(CAPABILITY_ID, { operationType: 5 }),
    ).resolves.toEqual({ id: `${CAPABILITY_ID}-op` })
    // removeOperation sends the ENUM NAME STRING in the path — no body.
    await expect(
      service.removeWarehouseCapabilityOperation(CAPABILITY_ID, 'Adjustment'),
    ).resolves.toBeUndefined()

    expect(receivedBodies).toEqual([
      {
        url: expect.stringContaining(`${API_BASE_URL}/warehouse-capabilities`),
        method: 'POST',
        body: { warehouseId: WAREHOUSE_ID, materialDomainId: capability.materialDomainId },
      },
      { url: CAPABILITY_ID, method: 'DELETE', body: undefined },
      {
        url: expect.stringContaining(`/warehouse-capabilities/${CAPABILITY_ID}/operations`),
        method: 'POST',
        body: { operationType: 5 },
      },
      { url: `${CAPABILITY_ID}/operations/Adjustment`, method: 'DELETE', body: undefined },
    ])

    // The grant body must NOT include rowVersion, code, or warehouse
    // housekeeping fields. The capability schema enforces this implicitly
    // via the `unknown` cast — re-asserting here keeps the wire contract
    // auditable from a single failing test.
    const grantBody = receivedBodies[0]?.body as Record<string, unknown>
    expect(Object.keys(grantBody).sort()).toEqual(['materialDomainId', 'warehouseId'])
    expect(grantBody).not.toHaveProperty('operations')
    expect(grantBody).not.toHaveProperty('rowVersion')
  })

  it('binds material-setting create, update, and status to the per-setting routes', async () => {
    const service = setupService()
    const receivedBodies: Array<{ method: string; path: string; body: unknown }> = []

    server.use(
      http.post(`${API_BASE_URL}/warehouse-material-settings`, async ({ request }) => {
        receivedBodies.push({ method: 'POST', path: request.url, body: await request.json() })
        return apiJson({ id: SETTING_ID }, { status: 201 })
      }),
      http.put(`${API_BASE_URL}/warehouse-material-settings/${SETTING_ID}`, async ({ request }) => {
        receivedBodies.push({ method: 'PUT', path: request.url, body: await request.json() })
        return new HttpResponse(null, { status: 200 })
      }),
      http.put(
        `${API_BASE_URL}/warehouse-material-settings/${SETTING_ID}/status`,
        async ({ request }) => {
          receivedBodies.push({ method: 'PUT', path: request.url, body: await request.json() })
          return new HttpResponse(null, { status: 200 })
        },
      ),
    )

    await expect(
      service.createWarehouseMaterialSetting({
        warehouseId: WAREHOUSE_ID,
        materialId: 'c5b3f1a3-1f5a-4a4c-9a7b-2b6f6c0a4a01',
        minQuantity: 2,
        maxQuantity: 10,
      }),
    ).resolves.toEqual({ id: SETTING_ID })

    await expect(
      service.updateWarehouseMaterialSetting(SETTING_ID, { minQuantity: 3, maxQuantity: 12 }),
    ).resolves.toBeUndefined()

    await expect(
      service.setWarehouseMaterialSettingStatus(SETTING_ID, { status: 1 }),
    ).resolves.toBeUndefined()

    expect(receivedBodies).toEqual([
      {
        method: 'POST',
        path: expect.stringContaining(`${API_BASE_URL}/warehouse-material-settings`),
        body: {
          warehouseId: WAREHOUSE_ID,
          materialId: 'c5b3f1a3-1f5a-4a4c-9a7b-2b6f6c0a4a01',
          minQuantity: 2,
          maxQuantity: 10,
        },
      },
      {
        method: 'PUT',
        path: expect.stringContaining(`/warehouse-material-settings/${SETTING_ID}`),
        body: { minQuantity: 3, maxQuantity: 12 },
      },
      {
        method: 'PUT',
        path: expect.stringContaining(`/warehouse-material-settings/${SETTING_ID}/status`),
        // The route binds `int Status` (Active=0, Inactive=1) and casts to the
        // enum server-side; the ordinal is the honest body, never the name.
        body: { status: 1 },
      },
    ])

    // No rowVersion, no nesting — the wire rejects unknown properties
    // silently for the warehouse list, so a stray `rowVersion` would still
    // pass but would never have been read by the server.
    const createBody = receivedBodies[0]?.body as Record<string, unknown>
    expect(Object.keys(createBody).sort()).toEqual([
      'materialId',
      'maxQuantity',
      'minQuantity',
      'warehouseId',
    ])
    const updateBody = receivedBodies[1]?.body as Record<string, unknown>
    expect(Object.keys(updateBody).sort()).toEqual(['maxQuantity', 'minQuantity'])
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
