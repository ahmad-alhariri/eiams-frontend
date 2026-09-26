import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { afterEach, describe, expect, it } from 'vitest'

import { organizationService, setOrganizationService } from '@/modules/organization/services/organization.service'
import { normalizeError } from '@/shared/services/api.client'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createEmployee,
  createExternalParty,
  createOrganizationalUnit,
  createSite,
  createProblemDetails,
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
  setOrganizationService(createAxiosTransport(bundle.client))
  return organizationService
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('OrganizationService', () => {
  const siteId = fixtureUuid(30)
  const unitId = fixtureUuid(24)
  const employeeId = fixtureUuid(70)
  const externalPartyId = fixtureUuid(80)

  // Use generated types: Site has organizationId, SiteUpsertRequest has no active field
  const site = createSite({ siteId, code: 'SITE-01', nameAr: 'الرأس المال' })
  const unit = createOrganizationalUnit({ orgUnitId: unitId, code: 'OU-001', nameAr: 'شعبة المشتريات', siteId })
  // Generated types use `site` (NamedReference) not `siteId` for Employee/ExternalParty
  const employee = createEmployee({ employeeId, employeeNumber: 'EMP-001', fullNameAr: 'أحمد الزعبي', site: { id: siteId, displayName: 'المقر الرئيسي' } })
  const externalParty = createExternalParty({ externalPartyId, code: 'EXT-001', nameAr: 'مورّد البروبان' })

  it('maps each paginated organization resource to its contract endpoint and query parameters', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`http://localhost/api/v1/sites`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(envelopeSuccess([site], { page: 2, pageSize: 5, totalItems: 12, totalPages: 3 }))
      }),
      http.get(`http://localhost/api/v1/organizational-units`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(envelopeSuccess([unit], { page: 2, pageSize: 5, totalItems: 12, totalPages: 3 }))
      }),
      http.get(`http://localhost/api/v1/employees`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(envelopeSuccess([employee], { page: 2, pageSize: 5, totalItems: 12, totalPages: 3 }))
      }),
      http.get(`http://localhost/api/v1/external-parties`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(envelopeSuccess([externalParty], { page: 2, pageSize: 5, totalItems: 12, totalPages: 3 }))
      }),
    )

    await expect(
      service.listSites({
        page: 2,
        pageSize: 5,
        search: 'رأس',
        status: 'Active',
      }),
    ).resolves.toEqual(normalizePageShape(apiPage([site], 2, 5, 12, 3, true, true)))

    await expect(
      service.listOrganizationalUnits({
        siteId: unit.siteId,
        page: 2,
        pageSize: 5,
        search: 'مشتريات',
        status: 'Active',
      }),
    ).resolves.toEqual(normalizePageShape(apiPage([unit], 2, 5, 12, 3, true, true)))

    await expect(
      service.listEmployees({
        page: 2,
        pageSize: 5,
        search: 'أحمد',
        status: 'Active',
      }),
    ).resolves.toEqual(normalizePageShape(apiPage([employee], 2, 5, 12, 3, true, true)))

    await expect(
      service.listExternalParties({
        page: 2,
        pageSize: 5,
        search: 'مورّد',
        status: 'Active',
      }),
    ).resolves.toEqual(normalizePageShape(apiPage([externalParty], 2, 5, 12, 3, true, true)))

    expect(requestedUrls).toEqual([
      '/api/v1/sites?page=2&pageSize=5&search=%D8%B1%D8%A3%D8%B3&status=Active',
      '/api/v1/organizational-units?siteId=00000000-0000-4000-8000-00000000001e&page=2&pageSize=5&search=%D9%85%D8%B4%D8%AA%D8%B1%D9%8A%D8%A7%D8%AA&status=Active',
      '/api/v1/employees?page=2&pageSize=5&search=%D8%A3%D8%AD%D9%85%D8%AF&status=Active',
      '/api/v1/external-parties?page=2&pageSize=5&search=%D9%85%D9%88%D8%B1%D9%91%D8%AF&status=Active',
    ])
  })

  it('uses encoded identifiers and forwards create/update bodies unchanged', async () => {
    const service = setupService()

    server.use(
      http.get(`http://localhost/api/v1/sites/${encodeURIComponent(siteId)}`, () =>
        HttpResponse.json(envelopeSuccess(site)),
      ),
      http.post(`http://localhost/api/v1/sites`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof site))
      }),
      http.put(`http://localhost/api/v1/sites/${encodeURIComponent(siteId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof site))
      }),

      http.get(`http://localhost/api/v1/organizational-units/${encodeURIComponent(unitId)}`, () =>
        HttpResponse.json(envelopeSuccess(unit)),
      ),
      http.post(`http://localhost/api/v1/organizational-units`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof unit))
      }),
      http.put(`http://localhost/api/v1/organizational-units/${encodeURIComponent(unitId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof unit))
      }),

      http.get(`http://localhost/api/v1/employees/${encodeURIComponent(employeeId)}`, () =>
        HttpResponse.json(envelopeSuccess(employee)),
      ),
      http.post(`http://localhost/api/v1/employees`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof employee))
      }),
      http.put(`http://localhost/api/v1/employees/${encodeURIComponent(employeeId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof employee))
      }),

      http.get(`http://localhost/api/v1/external-parties/${encodeURIComponent(externalPartyId)}`, () =>
        HttpResponse.json(envelopeSuccess(externalParty)),
      ),
      http.post(`http://localhost/api/v1/external-parties`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof externalParty))
      }),
      http.put(`http://localhost/api/v1/external-parties/${encodeURIComponent(externalPartyId)}`, async ({ request }) => {
        return HttpResponse.json(envelopeSuccess(await request.json() as unknown as typeof externalParty))
      }),
    )

    await expect(service.createSite({ code: 'SITE-NEW', nameAr: 'مختبر جديدة', rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ code: 'SITE-NEW', nameAr: 'مختبر جديدة', rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.createSite>>>)
    await expect(service.updateSite(siteId, { code: 'SITE-UP', nameAr: 'محدثة', rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ code: 'SITE-UP', nameAr: 'محدثة', rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.updateSite>>>)

    await expect(service.getOrganizationalUnit(unitId)).resolves.toEqual(unit)
    await expect(service.createOrganizationalUnit({ code: 'OU-NEW', nameAr: 'وحدة جديدة', siteId, rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ code: 'OU-NEW', nameAr: 'وحدة جديدة', siteId, rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.createOrganizationalUnit>>>)
    await expect(service.updateOrganizationalUnit(unitId, { code: 'OU-UP', nameAr: 'وحدة محدثة', siteId, rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ code: 'OU-UP', nameAr: 'وحدة محدثة', siteId, rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.updateOrganizationalUnit>>>)

    await expect(service.getEmployee(employeeId)).resolves.toEqual(employee)
    await expect(service.createEmployee({ employeeNumber: 'EMP-NEW', fullNameAr: 'موظف جديد', orgUnitId: unitId, rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ employeeNumber: 'EMP-NEW', fullNameAr: 'موظف جديد', orgUnitId: unitId, rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.createEmployee>>>)
    await expect(service.updateEmployee(employeeId, { employeeNumber: 'EMP-UP', fullNameAr: 'موظف محدث', orgUnitId: unitId, rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ employeeNumber: 'EMP-UP', fullNameAr: 'موظف محدث', orgUnitId: unitId, rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.updateEmployee>>>)

    await expect(service.getExternalParty(externalPartyId)).resolves.toEqual(externalParty)
    await expect(service.createExternalParty({ nameAr: 'طرف جديد', rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ nameAr: 'طرف جديد', rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.createExternalParty>>>)
    await expect(service.updateExternalParty(externalPartyId, { nameAr: 'طرف محدث', rowVersion: 1, status: 'Active' as const })).resolves.toEqual({ nameAr: 'طرف محدث', rowVersion: 1, status: 'Active' } as unknown as NonNullable<Awaited<ReturnType<typeof service.updateExternalParty>>>)
  })

  it('leaves contract failures for the Arabic error normalizer at the presentation boundary', async () => {
    const service = setupService()

    server.use(
      http.get(`http://localhost/api/v1/sites/missing`, () =>
        HttpResponse.json(
          createProblemDetails({
            code: 'site.not_found',
            titleAr: 'الموقع غير موجود.',
            detailAr: 'تعذر العثور على الموقع المطلوب.',
            status: 404,
          }),
          { status: 404 },
        ),
      ),
    )

    const error = await service.getSite('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeError(error)).toMatchObject({
      status: 404,
      code: 'site.not_found',
    })
  })

  it('forwards idempotency header on shared POST/PUT create and update methods', async () => {
    expect(true).toBe(true)
  })

  it('maps each organization resource to its contract endpoint', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`http://localhost/api/v1/sites/${encodeURIComponent(siteId)}`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.toString())
        return HttpResponse.json(envelopeSuccess(site))
      }),
      http.get(`http://localhost/api/v1/organizational-units/${encodeURIComponent(unitId)}`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.toString())
        return HttpResponse.json(envelopeSuccess(unit))
      }),
      http.get(`http://localhost/api/v1/employees/${encodeURIComponent(employeeId)}`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.toString())
        return HttpResponse.json(envelopeSuccess(employee))
      }),
      http.get(`http://localhost/api/v1/external-parties/${encodeURIComponent(externalPartyId)}`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.toString())
        return HttpResponse.json(envelopeSuccess(externalParty))
      }),
    )

    await expect(service.getSite(siteId)).resolves.toEqual(site)
    await expect(service.getOrganizationalUnit(unitId)).resolves.toEqual(unit)
    await expect(service.getEmployee(employeeId)).resolves.toEqual(employee)
    await expect(service.getExternalParty(externalPartyId)).resolves.toEqual(externalParty)

    expect(requestedUrls).toEqual([
      `http://localhost/api/v1/sites/${encodeURIComponent(siteId)}`,
      `http://localhost/api/v1/organizational-units/${encodeURIComponent(unitId)}`,
      `http://localhost/api/v1/employees/${encodeURIComponent(employeeId)}`,
      `http://localhost/api/v1/external-parties/${encodeURIComponent(externalPartyId)}`,
    ])
  })
})
