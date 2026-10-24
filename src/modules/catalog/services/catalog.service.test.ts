import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { catalogService, setCatalogService } from '@/modules/catalog/services/catalog.service'
import { normalizeApiError } from '@/shared/services/api-error'
import {
  wireMaterial,
  wireMaterialCategory,
  wireMaterialDomain,
  wireMaterialFamily,
  wireMaterialUnitConversion,
  wireUnitOfMeasure,
} from '@/test/msw/catalog-wire-fixtures'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

/**
 * The REAL collections. `/catalog/material-domains`,
 * `/catalog/material-categories` and `/catalog/material-families` DO NOT EXIST —
 * all three answer 404. The backend's MaterialDomains/MaterialCategories/
 * MaterialFamilies controllers serve `/catalog/domains`, `/catalog/categories`
 * and `/catalog/families`, and every handler below registers those.
 */
const DOMAINS_PATH = `${API_BASE_URL}/catalog/domains`
const CATEGORIES_PATH = `${API_BASE_URL}/catalog/categories`
const FAMILIES_PATH = `${API_BASE_URL}/catalog/families`
const MATERIALS_PATH = `${API_BASE_URL}/catalog/materials`
const UNITS_PATH = `${API_BASE_URL}/catalog/units-of-measure`

/** Server-owned correlation metadata, which every real envelope carries. */
const WIRE_META = { request_id: 'catalog-service-request', timestamp: '2026-01-01T00:00:00.000Z' }

// A real transport over a real Axios client (9uuf). The previous
// `bundle.client as unknown as Parameters<typeof createCatalogService>[0]` cast
// satisfied TypeScript while supplying none of requestPage/request/requestEmpty,
// which is how the missing production wiring stayed invisible.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  setCatalogService(transport)
  return catalogService
}

/** A create answer: HTTP 200 with `{ id }` (`ResourceIdResponse`), never 201. */
function createdJson(id: string) {
  return HttpResponse.json(
    { success: true, data: { id }, pagination: null, meta: WIRE_META },
    { status: 200 },
  )
}

/** An update/status/delete answer: HTTP 200 with `"data": null` and no body. */
function emptyJson() {
  return HttpResponse.json(
    { success: true, data: null, pagination: null, meta: WIRE_META },
    { status: 200 },
  )
}

describe('CatalogService', () => {
  it('maps catalog list queries and responses to the contract endpoints', async () => {
    const service = setupService()
    const domain = wireMaterialDomain()
    const category = wireMaterialCategory({ materialDomainId: domain.id })
    const family = wireMaterialFamily({ categoryId: category.id })
    const material = wireMaterial({ familyId: family.id, materialDomainId: domain.id })
    const conversion = wireMaterialUnitConversion({ materialId: material.id })
    const unit = wireUnitOfMeasure()
    const requestedUrls: string[] = []

    server.use(
      http.get(DOMAINS_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([domain])
      }),
      http.get(CATEGORIES_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([category])
      }),
      http.get(FAMILIES_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([family])
      }),
      http.get(MATERIALS_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([material])
      }),
      http.get(`${MATERIALS_PATH}/${material.id}/unit-conversions`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([conversion])
      }),
      http.get(UNITS_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([unit])
      }),
    )

    // Query filters are the ones the controllers actually bind. The old
    // `domainId` / `materialKind` parameters were fiction no catalog list
    // accepts, so they were dropped rather than asserted.
    await expect(service.listMaterialDomains({ status: 'Active' })).resolves.toMatchObject({
      items: [domain],
    })
    await expect(
      service.listMaterialCategories({ materialDomainId: domain.id }),
    ).resolves.toMatchObject({ items: [category] })
    await expect(service.listMaterialFamilies({ categoryId: category.id })).resolves.toMatchObject({
      items: [family],
    })
    await expect(
      service.listMaterials({ materialDomainId: domain.id, page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({ items: [material] })
    await expect(service.listMaterials({ search: 'حاسوب' })).resolves.toMatchObject({
      items: [material],
    })
    await expect(service.listUnitsOfMeasure({})).resolves.toMatchObject({ items: [unit] })
    await expect(service.listMaterialUnitConversions(material.id, {})).resolves.toMatchObject({
      items: [conversion],
    })

    expect(requestedUrls).toEqual([
      `${DOMAINS_PATH}?status=Active`,
      `${CATEGORIES_PATH}?materialDomainId=${domain.id}`,
      `${FAMILIES_PATH}?categoryId=${category.id}`,
      // The pagination params lead the query because the service spreads
      // `toWireOneBasedPaginationParams` first and appends the bound filters.
      `${MATERIALS_PATH}?page=2&pageSize=10&materialDomainId=${domain.id}`,
      `${MATERIALS_PATH}?search=${encodeURIComponent('حاسوب')}`,
      `${UNITS_PATH}`,
      `${MATERIALS_PATH}/${material.id}/unit-conversions`,
    ])
  })

  it('normalizes the wire pagination block into the shared ApiPage shape', async () => {
    const service = setupService()
    const domain = wireMaterialDomain()

    server.use(
      http.get(`${DOMAINS_PATH}`, () =>
        okPageJson([domain], { page: 2, pageSize: 25, totalCount: 51, totalPages: 3 }),
      ),
    )

    const page = await service.listMaterialDomains({ status: 'Inactive' })

    // `ApiPage<T>` — camelCase counts derived from the wire's snake_case block,
    // with the rows under `items` rather than `data`. There is no module-local
    // `PageMeta` wrapper any more, so the whole contract is asserted here.
    expect(page.items).toEqual([domain])
    expect(page.page).toBe(2)
    expect(page.pageSize).toBe(25)
    expect(page.totalItems).toBe(51)
    expect(page.totalPages).toBe(3)
    expect(page.hasPreviousPage).toBe(true)
    expect(page.hasNextPage).toBe(true)
    expect('data' in page).toBe(false)
    expect('pagination' in page).toBe(false)
  })

  it('uses encoded identifiers and forwards the contract create and update bodies unchanged', async () => {
    const service = setupService()
    const domain = wireMaterialDomain({ name: 'مجال محدَّث' })
    const unit = wireUnitOfMeasure({ name: 'صندوق' })
    const materialId = 'material / conversion'
    const conversionId = 'conversion / material'
    const conversion = wireMaterialUnitConversion()
    const domainId = 'domain / دمشق'
    const unitId = 'unit / دمشق'

    // Create bodies are strictly SMALLER than the old single "upsert" shape:
    // no `status` (a new record is Active by definition) and no `rowVersion`
    // (no catalog entity but Material has any version, and its field is
    // `catalogVersion`, not `rowVersion`). A domain rename carries `name` only,
    // not `code`, and a conversion update carries `factor` only.
    const domainCreateRequest = { name: domain.name, code: domain.code }
    const domainUpdateRequest = { name: domain.name }
    const unitCreateRequest = { name: unit.name, symbol: unit.symbol, unitType: unit.unitType }
    const unitUpdateRequest = { name: unit.name, symbol: unit.symbol, unitType: unit.unitType }
    const conversionCreateRequest = {
      fromUnitId: conversion.fromUnitId,
      toBaseUnitId: conversion.toBaseUnitId,
      factor: conversion.factor,
    }
    const conversionUpdateRequest = { factor: conversion.factor }

    const receivedBodies: unknown[] = []
    const requestedPaths: string[] = []

    server.use(
      http.get(`${DOMAINS_PATH}/${encodeURIComponent(domainId)}`, ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname)
        return okJson(domain)
      }),
      http.post(DOMAINS_PATH, async ({ request }) => {
        receivedBodies.push(await request.json())
        return createdJson(domain.id)
      }),
      http.put(`${DOMAINS_PATH}/${encodeURIComponent(domainId)}`, async ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname)
        receivedBodies.push(await request.json())
        return emptyJson()
      }),
      http.get(`${UNITS_PATH}/${encodeURIComponent(unitId)}`, ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname)
        return okJson(unit)
      }),
      http.post(UNITS_PATH, async ({ request }) => {
        receivedBodies.push(await request.json())
        return createdJson(unit.id)
      }),
      http.put(`${UNITS_PATH}/${encodeURIComponent(unitId)}`, async ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname)
        receivedBodies.push(await request.json())
        return emptyJson()
      }),
      http.get(
        `${MATERIALS_PATH}/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        ({ request }) => {
          requestedPaths.push(new URL(request.url).pathname)
          return okJson(conversion)
        },
      ),
      http.post(
        `${MATERIALS_PATH}/${encodeURIComponent(materialId)}/unit-conversions`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return createdJson(conversion.id)
        },
      ),
      http.put(
        `${MATERIALS_PATH}/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        async ({ request }) => {
          requestedPaths.push(new URL(request.url).pathname)
          receivedBodies.push(await request.json())
          return emptyJson()
        },
      ),
    )

    await expect(service.getMaterialDomain(domainId)).resolves.toEqual(domain)
    // A create answers `{ id }` (`ResourceIdResponse`, HTTP 200 — never 201).
    // Declaring it `Promise<MaterialDomain>` would hand the caller a phantom
    // record the server never sent.
    await expect(service.createMaterialDomain(domainCreateRequest)).resolves.toEqual({
      id: domain.id,
    })
    // An update answers an EMPTY body, so the service resolves `void`.
    await expect(
      service.updateMaterialDomain(domainId, domainUpdateRequest),
    ).resolves.toBeUndefined()
    await expect(service.getUnitOfMeasure(unitId)).resolves.toEqual(unit)
    await expect(service.createUnitOfMeasure(unitCreateRequest)).resolves.toEqual({ id: unit.id })
    await expect(service.updateUnitOfMeasure(unitId, unitUpdateRequest)).resolves.toBeUndefined()
    await expect(service.getMaterialUnitConversion(materialId, conversionId)).resolves.toEqual(
      conversion,
    )
    await expect(
      service.createMaterialUnitConversion(materialId, conversionCreateRequest),
    ).resolves.toEqual({ id: conversion.id })
    await expect(
      service.updateMaterialUnitConversion(materialId, conversionId, conversionUpdateRequest),
    ).resolves.toBeUndefined()

    // The encoded identifier, with its space and Arabic characters intact,
    // reaches the server rather than a percent-mangled or truncated path.
    expect(requestedPaths).toEqual([
      `${DOMAINS_PATH}/${encodeURIComponent(domainId)}`,
      `${DOMAINS_PATH}/${encodeURIComponent(domainId)}`,
      `${UNITS_PATH}/${encodeURIComponent(unitId)}`,
      `${UNITS_PATH}/${encodeURIComponent(unitId)}`,
      `${MATERIALS_PATH}/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
      `${MATERIALS_PATH}/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
    ])

    expect(receivedBodies).toEqual([
      domainCreateRequest,
      domainUpdateRequest,
      unitCreateRequest,
      unitUpdateRequest,
      conversionCreateRequest,
      conversionUpdateRequest,
    ])
  })

  it('leaves contract conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${MATERIALS_PATH}/missing`, () =>
        errJson(409, {
          code: 'Material.Stale',
          message: 'The material was modified by another user.',
        }),
      ),
    )

    const error = await service.getMaterial('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    // The wire nests `code` under `error` and the backend normalizes it to
    // UPPER_SNAKE_CASE (`ApiResults.NormalizeErrorCode`), so the flat dotted
    // `{ status, code, titleAr }` ProblemDetails the provisional snapshot
    // described is not what arrives. `normalizeWireErrorCode` replicates the
    // backend rule, so `Material.Stale` reads back as `MATERIAL_STALE`.
    expect(normalizeApiError(error)).toMatchObject({ status: 409, code: 'MATERIAL_STALE' })
  })
})
