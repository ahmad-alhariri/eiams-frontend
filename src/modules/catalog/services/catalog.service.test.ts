import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { afterEach, describe, expect, it } from 'vitest'

import { catalogService, setCatalogService } from '@/modules/catalog/services/catalog.service'
import { normalizeError } from '@/shared/services/api.client'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createMaterial,
  createMaterialCategory,
  createMaterialDomain,
  createMaterialFamily,
  createProblemDetails,
  createUnitOfMeasure,
  fixtureUuid,
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

function catalogPage<T>(
  items: readonly T[],
  page = 1,
  pageSize = items.length || 20,
  totalItems = items.length,
  totalPages = totalItems === 0 ? 0 : 1,
  hasPreviousPage = page > 1,
  hasNextPage = page < totalPages,
): { items: readonly T[]; meta: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean } } {
  return { items, meta: { page, pageSize, totalItems, totalPages, hasPreviousPage, hasNextPage } }
}

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  setCatalogService(createAxiosTransport(bundle.client))
  return catalogService
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('CatalogService', () => {
  const domainId = fixtureUuid(12)
  const categoryId = fixtureUuid(24)
  const familyId = fixtureUuid(36)
  const materialId = fixtureUuid(48)
  const unitId = fixtureUuid(60)
  const unit = createUnitOfMeasure({ unitId, code: 'PCS', nameAr: 'قطعة' })

  const domain = createMaterialDomain({ domainId, code: 'MD-001', nameAr: 'تقنية المعلومات' })
  const category = createMaterialCategory({ categoryId, domain: { id: domainId, displayName: 'تقنية المعلومات' }, code: 'CAT-001', nameAr: 'أجهزة' })
  const family = createMaterialFamily({ familyId, category: { id: categoryId, displayName: 'أجهزة' }, domain: { id: domainId, displayName: 'تقنية المعلومات' }, code: 'FAM-001', nameAr: 'حواسيب' })
  const material = createMaterial({
  materialId,
  code: 'M-1001',
  nameAr: 'كمبيوتر محمول',
  materialKind: 'Consumable',
  baseUnit: unit,
  domain: { id: domainId, displayName: 'تقنية المعلومات' },
  category: { id: categoryId, displayName: 'أجهزة' },
  family: { id: familyId, displayName: 'حواسيب' },
  requiresAssetNumber: false,
  })

  it('maps catalog list queries and responses to the generated contract endpoints', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`http://localhost/api/v1/catalog/material-domains`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([domain], { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/catalog/material-categories`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([category], { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/catalog/material-families`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([family], { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/catalog/materials`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([material], { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/catalog/units-of-measure`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([unit], { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))
      }),
    )

    await expect(service.listMaterialDomains({ status: 'Active' })).resolves.toEqual(catalogPage([domain], 1, 20, 1, 1))
    await expect(service.listMaterialCategories({ domainId, status: 'Active' })).resolves.toEqual(catalogPage([category], 1, 20, 1, 1))
    await expect(service.listMaterialFamilies({ categoryId, status: 'Active' })).resolves.toEqual(catalogPage([family], 1, 20, 1, 1))
    await expect(service.listMaterials({ materialKind: 'Consumable', status: 'Active' })).resolves.toEqual(catalogPage([material], 1, 20, 1, 1))
    await expect(service.listUnitsOfMeasure({ search: 'pcs', status: 'Active' })).resolves.toEqual(catalogPage([unit], 1, 20, 1, 1))

    expect(requestedUrls).toEqual([
      '/api/v1/catalog/material-domains?status=Active',
      '/api/v1/catalog/material-categories?domainId=' + domainId + '&status=Active',
      '/api/v1/catalog/material-families?categoryId=' + categoryId + '&status=Active',
      '/api/v1/catalog/materials?materialKind=Consumable&status=Active',
      '/api/v1/catalog/units-of-measure?search=pcs&status=Active',
    ])
  })

  it('maps each paginated catalog resource to its contract endpoint and query parameters', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`http://localhost/api/v1/catalog/material-domains`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([domain], { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 }))
      }),
      http.get(`http://localhost/api/v1/catalog/material-categories`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([category], { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 }))
      }),
      http.get(`http://localhost/api/v1/catalog/materials`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(envelopeSuccess([material], { page: 3, pageSize: 5, totalItems: 17, totalPages: 4 }))
      }),
    )

    await expect(
      service.listMaterialDomains({ status: 'Active', page: 2, pageSize: 10 }),
    ).resolves.toEqual(catalogPage([domain], 2, 10, 25, 3, true, true))
    await expect(
      service.listMaterialCategories({ domainId, status: 'Active', page: 1, pageSize: 50 }),
    ).resolves.toEqual(catalogPage([category], 1, 50, 1, 1, false, false))
    await expect(
      service.listMaterials({ materialKind: 'Consumable', status: 'Active', page: 3, pageSize: 5 }),
    ).resolves.toEqual(catalogPage([material], 3, 5, 17, 4, true, true))

    expect(requestedUrls).toEqual([
      `/api/v1/catalog/material-domains?status=Active&page=2&pageSize=10`,
      `/api/v1/catalog/material-categories?domainId=${domainId}&status=Active&page=1&pageSize=50`,
      `/api/v1/catalog/materials?materialKind=Consumable&status=Active&page=3&pageSize=5`,
    ])
  })

  it('uses encoded identifiers and forwards create/update bodies unchanged', async () => {
    const service = setupService()
    const domainRequest = {
      code: 'SW-001',
      nameAr: 'نرم افزار',
      status: 'Active' as const,
      rowVersion: 1,
    }
    const categoryRequest = {
      code: 'CAT-PERF',
      nameAr: 'مرفقات',
      domainId,
      parentCategoryId: null,
      materialDomainId: domainId,
      status: 'Active' as const,
      rowVersion: 1,
    }
    const familyRequest = {
      code: 'FF-200',
      nameAr: 'مقاعد مكتبية',
      categoryId,
      parentFamilyId: null,
      materialCategoryId: categoryId,
      status: 'Active' as const,
      rowVersion: 1,
    }
    const materialRequest = {
      code: 'M-2002',
      nameAr: 'طابعة ليزر',
      descriptionAr: 'طابعة ليزر لونية',
      materialKind: 'Consumable' as const,
      domainId,
      categoryId,
      familyId,
      unitId,
      nominalConversionFactor: 1,
      materialFamilyId: familyId,
      requiresAssetNumber: false,
      status: 'Active' as const,
      rowVersion: 1,
    }
    const unitRequest = {
      code: 'MEAS',
      nameAr: 'measures',
      descriptionAr: null,
      nominalConversionFactor: 1,
      baseUnitId: unitId,
      status: 'Active' as const,
      rowVersion: 1,
    }

    server.use(
      http.get(`http://localhost/api/v1/catalog/material-domains/${encodeURIComponent(domainId)}`, () =>
        HttpResponse.json(envelopeSuccess(domain)),
      ),
      http.post(`http://localhost/api/v1/catalog/material-domains`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof domain))
      }),
      http.put(`http://localhost/api/v1/catalog/material-domains/${encodeURIComponent(domainId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof domain))
      }),

      http.get(`http://localhost/api/v1/catalog/material-categories/${encodeURIComponent(categoryId)}`, () =>
        HttpResponse.json(envelopeSuccess(category)),
      ),
      http.post(`http://localhost/api/v1/catalog/material-categories`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof category))
      }),
      http.put(`http://localhost/api/v1/catalog/material-categories/${encodeURIComponent(categoryId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof category))
      }),

      http.get(`http://localhost/api/v1/catalog/material-families/${encodeURIComponent(familyId)}`, () =>
        HttpResponse.json(envelopeSuccess(family)),
      ),
      http.post(`http://localhost/api/v1/catalog/material-families`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof family))
      }),
      http.put(`http://localhost/api/v1/catalog/material-families/${encodeURIComponent(familyId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof family))
      }),

      http.get(`http://localhost/api/v1/catalog/materials/${encodeURIComponent(materialId)}`, () =>
        HttpResponse.json(envelopeSuccess(material)),
      ),
      http.post(`http://localhost/api/v1/catalog/materials`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof material))
      }),
      http.put(`http://localhost/api/v1/catalog/materials/${encodeURIComponent(materialId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof material))
      }),

      http.get(`http://localhost/api/v1/catalog/units-of-measure/${encodeURIComponent(unitId)}`, () =>
        HttpResponse.json(envelopeSuccess(unit)),
      ),
      http.post(`http://localhost/api/v1/catalog/units-of-measure`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof unit))
      }),
      http.put(`http://localhost/api/v1/catalog/units-of-measure/${encodeURIComponent(unitId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof unit))
      }),
    )

    await expect(service.getMaterialDomain(domainId)).resolves.toEqual(domain)
    await expect(service.createMaterialDomain(domainRequest)).resolves.toEqual(domainRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.createMaterialDomain>>>)
    await expect(service.updateMaterialDomain(domainId, domainRequest)).resolves.toEqual(domainRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.updateMaterialDomain>>>)

    await expect(service.getMaterialCategory(categoryId)).resolves.toEqual(category)
    await expect(service.createMaterialCategory(categoryRequest)).resolves.toEqual(categoryRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.createMaterialCategory>>>)
    await expect(service.updateMaterialCategory(categoryId, categoryRequest)).resolves.toEqual(categoryRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.updateMaterialCategory>>>)

    await expect(service.getMaterialFamily(familyId)).resolves.toEqual(family)
    await expect(service.createMaterialFamily(familyRequest)).resolves.toEqual(familyRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.createMaterialFamily>>>)
    await expect(service.updateMaterialFamily(familyId, familyRequest)).resolves.toEqual(familyRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.updateMaterialFamily>>>)

    await expect(service.getMaterial(materialId)).resolves.toEqual(material)
    await expect(service.createMaterial(materialRequest)).resolves.toEqual(materialRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.createMaterial>>>)
    await expect(service.updateMaterial(materialId, materialRequest)).resolves.toEqual(materialRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.updateMaterial>>>)

    await expect(service.getUnitOfMeasure(unitId)).resolves.toEqual(unit)
    await expect(service.createUnitOfMeasure(unitRequest)).resolves.toEqual(unitRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.createUnitOfMeasure>>>)
    await expect(service.updateUnitOfMeasure(unitId, unitRequest)).resolves.toEqual(unitRequest as unknown as NonNullable<Awaited<ReturnType<typeof service.updateUnitOfMeasure>>>)
  })

  it('leaves contract conflicts for the Arabic error normalizer when the server rejects with a stale version', async () => {
    const service = setupService()
    const conflict = createProblemDetails({
      code: 'material.stale',
      titleAr: 'تم تعديل المادة من قبل مستخدم آخر.',
      detailAr: 'يرجى تحديث البيانات وإعادة المحاولة.',
      status: 409,
    })

    server.use(
      http.get(`http://localhost/api/v1/catalog/materials/missing`, () =>
        HttpResponse.json(conflict, { status: 409 }),
      ),
    )

    const error = await service.getMaterial('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeError(error)).toMatchObject({
      status: 409,
      code: 'material.stale',
    })
  })
})
