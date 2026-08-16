import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createOrganizationService } from '@/modules/organization/services/organization.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createEmployee,
  createExternalParty,
  createOrganizationalUnit,
  createPage,
  createSite,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createOrganizationService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('OrganizationService', () => {
  it('maps each paginated organization resource to its contract endpoint and query parameters', async () => {
    const service = setupService()
    const site = createSite()
    const unit = createOrganizationalUnit()
    const employee = createEmployee()
    const externalParty = createExternalParty()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(createPage([site]))
      }),
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(createPage([unit]))
      }),
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(createPage([employee]))
      }),
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(createPage([externalParty]))
      }),
    )

    await expect(service.listSites({ pageIndex: 2, search: 'دمشق' })).resolves.toMatchObject({
      items: [site],
    })
    await expect(service.listOrganizationalUnits({ siteId: site.siteId })).resolves.toMatchObject({
      items: [unit],
    })
    await expect(service.listEmployees({ status: 'Active' })).resolves.toMatchObject({
      items: [employee],
    })
    await expect(service.listExternalParties({ search: 'خارجي' })).resolves.toMatchObject({
      items: [externalParty],
    })

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/sites?pageIndex=2&search=%D8%AF%D9%85%D8%B4%D9%82`,
      `${API_BASE_URL}/organizational-units?siteId=${unit.siteId}`,
      `${API_BASE_URL}/employees?status=Active`,
      `${API_BASE_URL}/external-parties?search=%D8%AE%D8%A7%D8%B1%D8%AC%D9%8A`,
    ])
  })

  it('uses encoded identifiers and forwards generated create and update payloads unchanged', async () => {
    const service = setupService()
    const site = createSite({ code: 'DAM-UPDATED' })
    const receivedBodies: unknown[] = []
    const encodedId = 'site / دمشق'
    const request = {
      organizationId: site.organizationId ?? '',
      code: site.code,
      nameAr: site.nameAr,
      address: site.address ?? null,
      governorate: site.governorate ?? null,
      rowVersion: site.rowVersion,
      status: site.status,
    }

    server.use(
      http.post(`${API_BASE_URL}/sites`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return HttpResponse.json(site, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/sites/${encodeURIComponent(encodedId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return HttpResponse.json(site)
        },
      ),
    )

    await expect(service.createSite(request)).resolves.toEqual(site)
    await expect(service.updateSite(encodedId, request)).resolves.toEqual(site)
    expect(receivedBodies).toEqual([request, request])
  })

  it('maps organizational-unit detail, creation, and update operations to their contract endpoints', async () => {
    const service = setupService()
    const unit = createOrganizationalUnit({ code: 'DAM-ADMIN-UPDATED' })
    const unitId = 'unit / دمشق'
    const request = {
      siteId: unit.siteId,
      code: unit.code,
      nameAr: unit.nameAr,
      rowVersion: unit.rowVersion,
      status: unit.status,
    }
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizational-units/${encodeURIComponent(unitId)}`, () =>
        HttpResponse.json(unit),
      ),
      http.post(`${API_BASE_URL}/organizational-units`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return HttpResponse.json(unit, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/organizational-units/${encodeURIComponent(unitId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return HttpResponse.json(unit)
        },
      ),
    )

    await expect(service.getOrganizationalUnit(unitId)).resolves.toEqual(unit)
    await expect(service.createOrganizationalUnit(request)).resolves.toEqual(unit)
    await expect(service.updateOrganizationalUnit(unitId, request)).resolves.toEqual(unit)
    expect(receivedBodies).toEqual([request, request])
  })

  it('maps employee detail, creation, and update operations to their contract endpoints', async () => {
    const service = setupService()
    const employee = createEmployee({ employeeNumber: 'EMP-UPDATED' })
    const employeeId = 'employee / دمشق'
    const request = {
      employeeNumber: employee.employeeNumber,
      fullNameAr: employee.fullNameAr,
      jobTitleAr: employee.jobTitleAr ?? null,
      orgUnitId: employee.orgUnit.id,
      rowVersion: employee.rowVersion,
      status: employee.status,
    }
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/employees/${encodeURIComponent(employeeId)}`, () =>
        HttpResponse.json(employee),
      ),
      http.post(`${API_BASE_URL}/employees`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return HttpResponse.json(employee, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/employees/${encodeURIComponent(employeeId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return HttpResponse.json(employee)
        },
      ),
    )

    await expect(service.getEmployee(employeeId)).resolves.toEqual(employee)
    await expect(service.createEmployee(request)).resolves.toEqual(employee)
    await expect(service.updateEmployee(employeeId, request)).resolves.toEqual(employee)
    expect(receivedBodies).toEqual([request, request])
  })

  it('maps external-party detail, creation, and update operations to their contract endpoints', async () => {
    const service = setupService()
    const externalParty = createExternalParty({ code: 'EXT-UPDATED' })
    const externalPartyId = 'external / دمشق'
    const request = {
      code: externalParty.code ?? null,
      contactInfo: externalParty.contactInfo ?? null,
      nameAr: externalParty.nameAr,
      notes: externalParty.notes ?? null,
      rowVersion: externalParty.rowVersion,
      status: externalParty.status,
    }
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/external-parties/${encodeURIComponent(externalPartyId)}`, () =>
        HttpResponse.json(externalParty),
      ),
      http.post(`${API_BASE_URL}/external-parties`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return HttpResponse.json(externalParty, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/external-parties/${encodeURIComponent(externalPartyId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return HttpResponse.json(externalParty)
        },
      ),
    )

    await expect(service.getExternalParty(externalPartyId)).resolves.toEqual(externalParty)
    await expect(service.createExternalParty(request)).resolves.toEqual(externalParty)
    await expect(service.updateExternalParty(externalPartyId, request)).resolves.toEqual(
      externalParty,
    )
    expect(receivedBodies).toEqual([request, request])
  })

  it('forwards a caller-owned idempotency configuration for external-party deactivation', async () => {
    const service = setupService()
    const externalParty = createExternalParty()
    let idempotencyKey: string | null = null

    server.use(
      http.post(
        `${API_BASE_URL}/external-parties/${externalParty.externalPartyId}/deactivate`,
        ({ request }) => {
          idempotencyKey = request.headers.get('Idempotency-Key')
          return HttpResponse.json({ ...externalParty, status: 'Inactive' })
        },
      ),
    )

    await expect(
      service.deactivateExternalParty(externalParty.externalPartyId, {
        headers: { 'Idempotency-Key': '7dd1d219-2ca2-4f38-a3c4-57f6df9cee55' },
      }),
    ).resolves.toMatchObject({ status: 'Inactive' })
    expect(idempotencyKey).toBe('7dd1d219-2ca2-4f38-a3c4-57f6df9cee55')
  })

  it('leaves contract errors for the shared Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/sites/missing`, () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'site.not_found',
            titleAr: 'الموقع غير موجود.',
            traceId: 'site-missing',
          },
          { status: 404 },
        ),
      ),
    )

    const error = await service.getSite('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({ status: 404, code: 'site.not_found' })
  })
})
