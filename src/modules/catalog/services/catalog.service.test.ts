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
  wireNamedReference,
  wireUnitOfMeasure,
} from '@/test/msw/catalog-wire-fixtures'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

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

describe('CatalogService', () => {
  it('maps catalog list queries and responses to the contract endpoints', async () => {
    const service = setupService()
    const domain = wireMaterialDomain()
    const category = wireMaterialCategory({
      materialDomain: wireNamedReference(domain.materialDomainId, domain.nameAr),
    })
    const family = wireMaterialFamily({
      materialCategory: wireNamedReference(category.materialCategoryId, category.nameAr),
    })
    const material = wireMaterial({
      materialFamily: wireNamedReference(family.materialFamilyId, family.nameAr),
    })
    const conversion = wireMaterialUnitConversion()
    const unit = wireUnitOfMeasure()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/catalog/material-domains`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([domain])
      }),
      http.get(`${API_BASE_URL}/catalog/material-categories`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([category])
      }),
      http.get(`${API_BASE_URL}/catalog/material-families`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([family])
      }),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([material])
      }),
      http.get(
        `${API_BASE_URL}/catalog/materials/${material.materialId}/unit-conversions`,
        ({ request }) => {
          requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
          return okPageJson([conversion])
        },
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return okPageJson([unit])
      }),
    )

    await expect(service.listMaterialDomains({ status: 'Active' })).resolves.toMatchObject({
      items: [domain],
    })
    await expect(
      service.listMaterialCategories({ domainId: domain.materialDomainId }),
    ).resolves.toMatchObject({ items: [category] })
    await expect(service.listMaterialFamilies({ search: 'حاسوب' })).resolves.toMatchObject({
      items: [family],
    })
    await expect(
      service.listMaterials({ materialKind: 'Consumable', page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({ items: [material] })
    await expect(service.listUnitsOfMeasure({})).resolves.toMatchObject({ items: [unit] })
    await expect(
      service.listMaterialUnitConversions(material.materialId, {}),
    ).resolves.toMatchObject({ items: [conversion] })

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/catalog/material-domains?status=Active`,
      `${API_BASE_URL}/catalog/material-categories?domainId=${domain.materialDomainId}`,
      `${API_BASE_URL}/catalog/material-families?search=${encodeURIComponent('حاسوب')}`,
      `${API_BASE_URL}/catalog/materials?materialKind=Consumable&page=2&pageSize=10`,
      `${API_BASE_URL}/catalog/units-of-measure`,
      `${API_BASE_URL}/catalog/materials/${material.materialId}/unit-conversions`,
    ])
  })

  it('uses encoded identifiers and forwards the contract create and update bodies unchanged', async () => {
    const service = setupService()
    const domain = wireMaterialDomain({ code: 'IT-UPDATED' })
    const unit = wireUnitOfMeasure({ code: 'BOX' })
    const materialId = 'material / conversion'
    const conversionId = 'conversion / material'
    const conversion = wireMaterialUnitConversion()
    const domainId = 'domain / دمشق'
    const unitId = 'unit / دمشق'
    const domainRequest = {
      nameAr: domain.nameAr,
      code: domain.code,
      status: domain.status,
      rowVersion: domain.rowVersion,
    }
    const unitRequest = {
      code: unit.code,
      nameAr: unit.nameAr,
      descriptionAr: null,
      nominalConversionFactor: 1,
      baseUnitId: null,
      status: unit.status,
      rowVersion: unit.rowVersion,
    }
    const receivedBodies: unknown[] = []
    const conversionCreateRequest = {
      materialId: conversion.materialId,
      unitId: conversion.unitId,
      conversionFactor: conversion.conversionFactor,
      status: 'Active' as const,
      rowVersion: 0,
    }
    const conversionUpdateRequest = {
      materialId: conversion.materialId,
      unitId: conversion.unitId,
      conversionFactor: conversion.conversionFactor,
      status: 'Inactive' as const,
      rowVersion: conversion.rowVersion,
    }

    server.use(
      http.get(`${API_BASE_URL}/catalog/material-domains/${encodeURIComponent(domainId)}`, () =>
        okJson(domain),
      ),
      http.post(`${API_BASE_URL}/catalog/material-domains`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(
          { success: true, data: domain, pagination: null, meta: WIRE_META },
          { status: 201 },
        )
      }),
      http.put(
        `${API_BASE_URL}/catalog/material-domains/${encodeURIComponent(domainId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return okJson(domain)
        },
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure/${encodeURIComponent(unitId)}`, () =>
        okJson(unit),
      ),
      http.post(`${API_BASE_URL}/catalog/units-of-measure`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(
          { success: true, data: unit, pagination: null, meta: WIRE_META },
          { status: 201 },
        )
      }),
      http.put(
        `${API_BASE_URL}/catalog/units-of-measure/${encodeURIComponent(unitId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return okJson(unit)
        },
      ),
      http.get(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        () => okJson(conversion),
      ),
      http.post(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(
            { success: true, data: conversion, pagination: null, meta: WIRE_META },
            { status: 201 },
          )
        },
      ),
      http.put(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return okJson(conversion)
        },
      ),
    )

    await expect(service.getMaterialDomain(domainId)).resolves.toEqual(domain)
    await expect(service.createMaterialDomain(domainRequest)).resolves.toEqual(domain)
    await expect(service.updateMaterialDomain(domainId, domainRequest)).resolves.toEqual(domain)
    await expect(service.getUnitOfMeasure(unitId)).resolves.toEqual(unit)
    await expect(service.createUnitOfMeasure(unitRequest)).resolves.toEqual(unit)
    await expect(service.updateUnitOfMeasure(unitId, unitRequest)).resolves.toEqual(unit)
    await expect(service.getMaterialUnitConversion(materialId, conversionId)).resolves.toEqual(
      conversion,
    )
    await expect(
      service.createMaterialUnitConversion(materialId, conversionCreateRequest),
    ).resolves.toEqual(conversion)
    await expect(
      service.updateMaterialUnitConversion(materialId, conversionId, conversionUpdateRequest),
    ).resolves.toEqual(conversion)
    expect(receivedBodies).toEqual([
      domainRequest,
      domainRequest,
      unitRequest,
      unitRequest,
      conversionCreateRequest,
      conversionUpdateRequest,
    ])
  })

  it('leaves contract conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/missing`, () =>
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
