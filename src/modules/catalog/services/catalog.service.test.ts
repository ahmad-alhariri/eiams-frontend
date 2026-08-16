import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createCatalogService } from '@/modules/catalog/services/catalog.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createMaterial,
  createMaterialCategory,
  createMaterialDomain,
  createMaterialFamily,
  createMaterialUnitConversion,
  createPage,
  createUnitOfMeasure,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createCatalogService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('CatalogService', () => {
  it('maps catalog list queries and responses to the generated contract endpoints', async () => {
    const service = setupService()
    const domain = createMaterialDomain()
    const category = createMaterialCategory()
    const family = createMaterialFamily()
    const material = createMaterial()
    const conversion = createMaterialUnitConversion({ material: material.family })
    const unit = createUnitOfMeasure()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json([domain])
      }),
      http.get(`${API_BASE_URL}/catalog/categories`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json([category])
      }),
      http.get(`${API_BASE_URL}/catalog/families`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json([family])
      }),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(createPage([material]))
      }),
      http.get(
        `${API_BASE_URL}/catalog/materials/${material.materialId}/unit-conversions`,
        ({ request }) => {
          requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
          return HttpResponse.json([conversion])
        },
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json([unit])
      }),
    )

    await expect(service.listMaterialDomains({ status: 'Active' })).resolves.toEqual([domain])
    await expect(service.listMaterialCategories({ domainId: domain.domainId })).resolves.toEqual([
      category,
    ])
    await expect(service.listMaterialFamilies({ search: 'حاسوب' })).resolves.toEqual([family])
    await expect(
      service.listMaterials({ materialKind: 'Durable', pageIndex: 2, pageSize: 10 }),
    ).resolves.toEqual(createPage([material]))
    await expect(service.listUnitsOfMeasure()).resolves.toEqual([unit])
    await expect(service.listMaterialUnitConversions(material.materialId)).resolves.toEqual([
      conversion,
    ])

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/catalog/domains?status=Active`,
      `${API_BASE_URL}/catalog/categories?domainId=${domain.domainId}`,
      `${API_BASE_URL}/catalog/families?search=%D8%AD%D8%A7%D8%B3%D9%88%D8%A8`,
      `${API_BASE_URL}/catalog/materials?materialKind=Durable&pageIndex=2&pageSize=10`,
      `${API_BASE_URL}/catalog/units-of-measure`,
      `${API_BASE_URL}/catalog/materials/${material.materialId}/unit-conversions`,
    ])
  })

  it('uses encoded identifiers and forwards generated create and update bodies unchanged', async () => {
    const service = setupService()
    const domain = createMaterialDomain({ code: 'IT-UPDATED' })
    const unit = createUnitOfMeasure({ code: 'BOX' })
    const materialId = 'material / conversion'
    const conversionId = 'conversion / material'
    const conversion = createMaterialUnitConversion()
    const domainId = 'domain / دمشق'
    const unitId = 'unit / دمشق'
    const domainRequest = {
      code: domain.code,
      nameAr: domain.nameAr,
      rowVersion: domain.rowVersion,
      status: domain.status,
    }
    const unitRequest = {
      code: unit.code,
      nameAr: unit.nameAr,
      symbolAr: unit.symbolAr,
      rowVersion: unit.rowVersion,
      status: unit.status,
    }
    const receivedBodies: unknown[] = []
    const conversionCreateRequest = {
      fromUnitId: conversion.fromUnit.id,
      factor: conversion.factor,
    }
    const conversionUpdateRequest = {
      factor: conversion.factor,
      rowVersion: conversion.rowVersion,
      status: 'Inactive' as const,
    }

    server.use(
      http.get(`${API_BASE_URL}/catalog/domains/${encodeURIComponent(domainId)}`, () =>
        HttpResponse.json(domain),
      ),
      http.post(`${API_BASE_URL}/catalog/domains`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(domain, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/catalog/domains/${encodeURIComponent(domainId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(domain)
        },
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure/${encodeURIComponent(unitId)}`, () =>
        HttpResponse.json(unit),
      ),
      http.post(`${API_BASE_URL}/catalog/units-of-measure`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(unit, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/catalog/units-of-measure/${encodeURIComponent(unitId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(unit)
        },
      ),
      http.get(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        () => HttpResponse.json(conversion),
      ),
      http.post(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(conversion, { status: 201 })
        },
      ),
      http.put(
        `${API_BASE_URL}/catalog/materials/${encodeURIComponent(materialId)}/unit-conversions/${encodeURIComponent(conversionId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(conversion)
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
        HttpResponse.json(
          { status: 409, code: 'material.stale', titleAr: 'تم تعديل المادة من مستخدم آخر.' },
          { status: 409 },
        ),
      ),
    )

    const error = await service.getMaterial('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({ status: 409, code: 'material.stale' })
  })
})
