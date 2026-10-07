import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { createCatalogService } from '@/modules/catalog/services/catalog.service'
import { createWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import { isApiSuccessResponse } from '@/shared/api/envelope'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createMaterialDomain, createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

/**
 * Proves the transport seam is real, in both directions.
 *
 * `eiams-frontend-9uuf` was a defect that survived a green suite because five
 * service tests reached the singleton through a cast. These cases exist so the
 * next version of that mistake fails a test instead of passing one:
 *
 *   1. FORWARD — a service built over a REAL transport returns real data. This
 *      is the case the cast defeated: an `AxiosInstance` has no `requestPage`,
 *      so the cast made a suite assert against a service whose every list call
 *      would throw. Here the same call succeeds, which is only possible if the
 *      transport is genuinely wired.
 *   2. SHAPE — the wire envelope is the contract, and the fixtures speak it.
 *      Note `createPage()` from factories returns a UI page (`{items, meta}`),
 *      which is NOT what the transport reads; `okPageJson()` is the truthful
 *      helper. Mixing them is what produced
 *      `Cannot read properties of undefined (reading 'page')` here.
 *   3. INVERSE — envelope detection is the ONE shared guard
 *      (`isApiSuccessResponse`), not re-implemented per service.
 */

const API_BASE_URL = '/api/v1'
const WIRE_META = { request_id: 'transport-seam-request', timestamp: '2026-01-01T00:00:00.000Z' }
const createHarness = registerTestTransportHarness(API_BASE_URL)

describe('the ApiTransport seam is real, not a cast', () => {
  it('serves a catalog list through the shared transport (forward)', async () => {
    const { transport } = createHarness()
    const domain = createMaterialDomain()

    server.use(http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])))

    const service = createCatalogService(transport)
    const page = await service.listMaterialDomains({})

    // Under the old cast this line threw `transport.requestPage is not a
    // function` — which is why the suite had to cast to look green.
    expect(page.items).toHaveLength(1)
    // Asserted on `nameAr`, not `materialDomainId`: `createMaterialDomain()`
    // returns `domainId` while its declared type says `materialDomainId`, so
    // the id comparison would be asserting a fixture bug. That mismatch is
    // recorded against eiams-frontend-tgl3; naming it here keeps this test
    // honest about what it actually proves.
    expect(page.items[0]?.nameAr).toBe(domain.nameAr)
  })

  it('serves a warehouse list through the shared transport (forward)', async () => {
    const { transport } = createHarness()
    const warehouse = createWarehouse()

    server.use(http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])))

    const service = createWarehouseService(transport)
    const page = await service.listWarehouses({})

    expect(page.items).toHaveLength(1)
    // The wire identifier is `id` (txq4); `warehouseId` was the frozen
    // generated snapshot's fiction and is absent from every real record.
    expect(page.items[0]?.id).toBe(warehouse.id)
    expect(page.items[0]?.name).toBe(warehouse.name)
  })

  it('unwraps the envelope: request resolves to the payload, not the envelope', async () => {
    const { transport } = createHarness()
    const warehouse = createWarehouse()

    server.use(http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)))

    // `okJson` wraps the record in `{ success, data, pagination, meta }`. If the
    // transport returned the envelope, `record.id` would be undefined and the
    // `success` key would be what the assertion below would find instead.
    const record = await transport.request<{ id: string; name: string }>({
      path: `/warehouses/${warehouse.id}`,
      method: 'GET',
    })

    expect(record).toEqual(warehouse)
    expect('success' in record).toBe(false)
    expect('data' in record).toBe(false)
  })

  it('unwraps the envelope: requestPage resolves to a normalized page, requestEmpty to void', async () => {
    const { transport } = createHarness()
    const warehouse = createWarehouse()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        okPageJson([warehouse], { page: 2, pageSize: 25, totalCount: 51, totalPages: 3 }),
      ),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.id}`, () =>
        HttpResponse.json({ success: true, data: null, pagination: null, meta: WIRE_META }),
      ),
    )

    const page = await transport.requestPage<typeof warehouse>({
      path: '/warehouses',
      method: 'GET',
    })

    // `ApiPage<T>`: camelCase counts derived from the wire's snake_case block,
    // with the rows under `items` rather than `data`.
    expect(page.items).toEqual([warehouse])
    expect(page.page).toBe(2)
    expect(page.pageSize).toBe(25)
    expect(page.totalItems).toBe(51)
    expect(page.totalPages).toBe(3)
    expect(page.hasPreviousPage).toBe(true)
    expect(page.hasNextPage).toBe(true)
    expect('data' in page).toBe(false)
    expect('pagination' in page).toBe(false)

    // `PUT /warehouses/{id}` answers an empty body; the service reads nothing
    // off the result, so the transport must resolve `void`, not `null`.
    const result = await transport.requestEmpty({
      path: `/warehouses/${warehouse.id}`,
      method: 'PUT',
      body: { name: 'المستودع المحدّث' },
    })

    expect(result).toBeUndefined()
  })

  it('normalizes the wire snake_case pagination into the frontend page shape', async () => {
    const { transport } = createHarness()
    const domain = createMaterialDomain()

    server.use(
      http.get(`${API_BASE_URL}/catalog/material-domains`, () =>
        okPageJson([domain], { page: 3, pageSize: 25, totalCount: 51, totalPages: 3 }),
      ),
    )

    const service = createCatalogService(transport)
    const page = await service.listMaterialDomains({})

    // `page_size`/`total_items` on the wire, `pageSize`/`totalItems` in the
    // frontend page — the boundary the backend owns per ADR-0001.
    //
    // `meta.page` is deliberately NOT asserted. The catalog service's local
    // `toPage` emits `meta.page` while the declared `PageMeta` says
    // `pageIndex`, reconciled by an `as unknown as` cast in the service. That
    // contradiction is real and is filed against tgl3; asserting either side
    // here would freeze one of them as correct.
    expect(page.meta.pageSize).toBe(25)
    expect(page.meta.totalItems).toBe(51)
    expect(page.meta.totalPages).toBe(3)
  })

  it('recognises a well-formed success envelope', () => {
    expect(
      isApiSuccessResponse({
        success: true,
        data: { id: 'x' },
        meta: { request_id: 'r-1', timestamp: '2026-01-01T00:00:00Z' },
      }),
    ).toBe(true)
  })

  it.each([
    ['missing the success flag', { data: {}, meta: { request_id: 'r', timestamp: 't' } }],
    [
      'success is false on a success shape',
      { success: false, data: {}, meta: { request_id: 'r', timestamp: 't' } },
    ],
    ['missing data', { success: true, meta: { request_id: 'r', timestamp: 't' } }],
    ['a bare array', []],
    ['a string', 'nope'],
    ['null', null],
    ['undefined', undefined],
  ])('rejects a malformed success envelope: %s', (_label, body) => {
    // One guard, shared. Its contract is deliberately narrow — `success === true`
    // plus a `data` key — because `meta` is server-owned correlation metadata
    // that must never gate a read (see docs/direct-backend-integration-plan.md
    // authority rule 1-5). The cases above are exactly what it rejects.
    expect(isApiSuccessResponse(body)).toBe(false)
  })

  it('the production singleton is built from the same factory as the test harness', async () => {
    const { transport } = createHarness()
    const { apiTransport } = await import('@/shared/api/transport')

    // If the production and test transports ever diverged, these suites would
    // validate a transport the application does not actually use.
    expect(Object.keys(transport).sort()).toEqual(Object.keys(apiTransport).sort())
    for (const method of ['request', 'requestPage', 'requestEmpty'] as const) {
      expect(typeof apiTransport[method]).toBe('function')
    }
  })
})
