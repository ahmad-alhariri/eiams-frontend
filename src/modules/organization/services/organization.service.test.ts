import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  organizationService,
  setOrganizationService,
} from '@/modules/organization/services/organization.service'
import type {
  Employee,
  OrganizationalUnit,
  Site,
} from '@/modules/organization/types/organization.types'
import { normalizeApiError } from '@/shared/services/api-error'
import { createExternalParty, fixtureUuid } from '@/test/msw/factories'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000050'
const SITE_ID = '00000000-0000-4000-8000-000000000051'
const ORG_UNIT_ID = '00000000-0000-4000-8000-000000000052'
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000053'

/**
 * Site / OrganizationalUnit / Employee fixtures in the REAL wire shape, built
 * locally rather than through the shared factories: `createSite`,
 * `createOrganizationalUnit` and `createEmployee` still return the fiction
 * (`siteId` / `orgUnitId` / `employeeId`, `nameAr`, `rowVersion`, nested
 * `orgUnit` and `site` objects), and a fixture the production response could
 * never produce is exactly what kept this suite green against the wrong
 * contract. Site carries NO `rowVersion`; Employee carries NO nested reference
 * objects at all.
 */
function wireSite(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_ID,
    organizationId: ORGANIZATION_ID,
    name: 'المقر الرئيسي',
    code: 'DAM-HQ',
    location: 'دمشق',
    governorateCode: 'DIM',
    status: 'Active',
    ...overrides,
  }
}

function wireUnit(overrides: Partial<OrganizationalUnit> = {}): OrganizationalUnit {
  return {
    id: ORG_UNIT_ID,
    siteId: SITE_ID,
    parentId: null,
    name: 'الإدارة',
    unitType: 'Department',
    status: 'Active',
    ...overrides,
  }
}

function wireEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: EMPLOYEE_ID,
    orgUnitId: ORG_UNIT_ID,
    fullName: 'موظف تجريبي',
    employeeNumber: 'EMP-001',
    jobTitle: 'أمين مستودع',
    status: 'Active',
    ...overrides,
  }
}

// A real transport over a real Axios client (9uuf); the previous cast supplied
// none of requestPage/request/requestEmpty while satisfying the type.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  setOrganizationService(transport)
  return organizationService
}

describe('OrganizationService', () => {
  it('maps each paginated organization resource to its contract endpoint and query parameters', async () => {
    const service = setupService()
    const site = wireSite()
    const unit = wireUnit()
    const employee = wireEmployee()
    const externalParty = createExternalParty()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return okPageJson([site])
      }),
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return okPageJson([unit])
      }),
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return okPageJson([employee])
      }),
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return okPageJson([externalParty])
      }),
    )

    await expect(service.listSites({ page: 2, search: 'دمشق' })).resolves.toMatchObject({
      items: [site],
    })
    await expect(service.listOrganizationalUnits({ siteId: site.id })).resolves.toMatchObject({
      items: [unit],
    })
    await expect(service.listEmployees({ status: 'Active' })).resolves.toMatchObject({
      items: [employee],
    })
    await expect(service.listExternalParties({ search: 'خارجي' })).resolves.toMatchObject({
      items: [externalParty],
    })

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/sites?page=2&search=%D8%AF%D9%85%D8%B4%D9%82`,
      `${API_BASE_URL}/organizational-units?siteId=${SITE_ID}`,
      `${API_BASE_URL}/employees?status=Active`,
      `${API_BASE_URL}/external-parties?search=%D8%AE%D8%A7%D8%B1%D8%AC%D9%8A`,
    ])
  })

  it('reads each aggregate through the flat wire shape: id/name, no nameAr and no rowVersion', async () => {
    const service = setupService()
    const site = wireSite({ location: null, governorateCode: null })
    const unit = wireUnit()
    const employee = wireEmployee({ jobTitle: null })

    server.use(
      http.get(`${API_BASE_URL}/sites/${SITE_ID}`, () => okJson(site)),
      http.get(`${API_BASE_URL}/organizational-units/${ORG_UNIT_ID}`, () => okJson(unit)),
      http.get(`${API_BASE_URL}/employees/${EMPLOYEE_ID}`, () => okJson(employee)),
    )

    const readSite = await service.getSite(SITE_ID)
    const readUnit = await service.getOrganizationalUnit(ORG_UNIT_ID)
    const readEmployee = await service.getEmployee(EMPLOYEE_ID)

    // Site is NOT a versioned aggregate and serves no address/governorate name.
    expect(Object.keys(readSite).sort()).toEqual([
      'code',
      'governorateCode',
      'id',
      'location',
      'name',
      'organizationId',
      'status',
    ])
    expect(readSite).not.toHaveProperty('siteId')
    expect(readSite).not.toHaveProperty('nameAr')
    expect(readSite).not.toHaveProperty('address')
    expect(readSite).not.toHaveProperty('rowVersion')

    // The unit serves parentId/unitType and serves no code.
    expect(Object.keys(readUnit).sort()).toEqual([
      'id',
      'name',
      'parentId',
      'siteId',
      'status',
      'unitType',
    ])
    expect(readUnit).not.toHaveProperty('orgUnitId')
    expect(readUnit).not.toHaveProperty('parentOrgUnitId')
    expect(readUnit).not.toHaveProperty('code')

    // The employee serves a flat orgUnitId and NO nested reference objects.
    expect(Object.keys(readEmployee).sort()).toEqual([
      'employeeNumber',
      'fullName',
      'id',
      'jobTitle',
      'orgUnitId',
      'status',
    ])
    expect(readEmployee).not.toHaveProperty('employeeId')
    expect(readEmployee).not.toHaveProperty('fullNameAr')
    expect(readEmployee).not.toHaveProperty('orgUnit')
    expect(readEmployee).not.toHaveProperty('site')
  })

  it('sends the exact site create body, returns only the new id, and returns nothing on update', async () => {
    const service = setupService()
    const site = wireSite({ code: 'DAM-HQ' })
    const encodedId = 'site / دمشق'
    const receivedBodies: unknown[] = []

    // POST binds organizationId/name/code/location/governorateCode.
    const createRequest = {
      organizationId: site.organizationId,
      name: site.name,
      code: site.code,
      location: site.location ?? null,
      governorateCode: site.governorateCode ?? null,
    }
    // PUT binds name/location/governorateCode. `code` and `organizationId` are
    // create-only and Site is not versioned, so there is no expectedRowVersion.
    const updateRequest = {
      name: 'المقر المحدّث',
      location: null,
      governorateCode: null,
    }

    server.use(
      http.post(`${API_BASE_URL}/sites`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return apiJson({ id: SITE_ID }, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/sites/${encodeURIComponent(encodedId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          // PUT returns an EMPTY body — the old fixture answered with the whole
          // site, which is what let `onSuccess: ({siteId}) => ...` look safe at
          // the type level while crashing at runtime.
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(service.createSite(createRequest)).resolves.toEqual({ id: SITE_ID })
    await expect(service.updateSite(encodedId, updateRequest)).resolves.toBeUndefined()
    expect(receivedBodies).toEqual([createRequest, updateRequest])

    const [sentCreate, sentUpdate] = receivedBodies as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(Object.keys(sentUpdate).sort()).toEqual(['governorateCode', 'location', 'name'])
    for (const body of [sentCreate, sentUpdate]) {
      expect(body).not.toHaveProperty('status')
      expect(body).not.toHaveProperty('rowVersion')
      expect(body).not.toHaveProperty('nameAr')
      expect(body).not.toHaveProperty('address')
      expect(body).not.toHaveProperty('governorate')
    }
    expect(sentUpdate).not.toHaveProperty('code')
    expect(sentUpdate).not.toHaveProperty('organizationId')
  })

  it('sends the exact org-unit create body and the create-only-free update body', async () => {
    const service = setupService()
    const unit = wireUnit()
    const encodedId = 'unit / دمشق'
    const receivedBodies: unknown[] = []

    const createRequest = {
      siteId: unit.siteId,
      parentId: null,
      name: unit.name,
      unitType: unit.unitType,
    }
    // `siteId` and `parentId` are create-only: re-siting and re-parenting are
    // not exposed, so they must not ride along on the update.
    const updateRequest = { name: 'الإدارة المحدّثة', unitType: 'Section' }

    server.use(
      http.post(`${API_BASE_URL}/organizational-units`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return apiJson({ id: ORG_UNIT_ID }, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/organizational-units/${encodeURIComponent(encodedId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(service.createOrganizationalUnit(createRequest)).resolves.toEqual({
      id: ORG_UNIT_ID,
    })
    await expect(
      service.updateOrganizationalUnit(encodedId, updateRequest),
    ).resolves.toBeUndefined()
    expect(receivedBodies).toEqual([createRequest, updateRequest])

    const [sentCreate, sentUpdate] = receivedBodies as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(Object.keys(sentCreate).sort()).toEqual(['name', 'parentId', 'siteId', 'unitType'])
    expect(Object.keys(sentUpdate).sort()).toEqual(['name', 'unitType'])
    for (const body of [sentCreate, sentUpdate]) {
      expect(body).not.toHaveProperty('status')
      expect(body).not.toHaveProperty('rowVersion')
      expect(body).not.toHaveProperty('code')
      expect(body).not.toHaveProperty('nameAr')
    }
    expect(sentUpdate).not.toHaveProperty('siteId')
    expect(sentUpdate).not.toHaveProperty('parentId')
  })

  it('sends the exact employee create body and the create-only-free update body', async () => {
    const service = setupService()
    const employee = wireEmployee()
    const encodedId = 'employee / دمشق'
    const receivedBodies: unknown[] = []

    const createRequest = {
      orgUnitId: employee.orgUnitId,
      fullName: employee.fullName,
      employeeNumber: employee.employeeNumber,
      jobTitle: employee.jobTitle ?? null,
    }
    // `orgUnitId` and `employeeNumber` are create-only, so an employee cannot
    // be re-assigned to another unit or renumbered through this contract.
    const updateRequest = { fullName: 'موظف محدّث', jobTitle: null }

    server.use(
      http.post(`${API_BASE_URL}/employees`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        return apiJson({ id: EMPLOYEE_ID }, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/employees/${encodeURIComponent(encodedId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(service.createEmployee(createRequest)).resolves.toEqual({ id: EMPLOYEE_ID })
    await expect(service.updateEmployee(encodedId, updateRequest)).resolves.toBeUndefined()
    expect(receivedBodies).toEqual([createRequest, updateRequest])

    const [sentCreate, sentUpdate] = receivedBodies as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(Object.keys(sentCreate).sort()).toEqual([
      'employeeNumber',
      'fullName',
      'jobTitle',
      'orgUnitId',
    ])
    expect(Object.keys(sentUpdate).sort()).toEqual(['fullName', 'jobTitle'])
    for (const body of [sentCreate, sentUpdate]) {
      expect(body).not.toHaveProperty('status')
      expect(body).not.toHaveProperty('rowVersion')
      expect(body).not.toHaveProperty('fullNameAr')
      expect(body).not.toHaveProperty('jobTitleAr')
      expect(body).not.toHaveProperty('orgUnit')
      expect(body).not.toHaveProperty('site')
    }
    expect(sentUpdate).not.toHaveProperty('orgUnitId')
    expect(sentUpdate).not.toHaveProperty('employeeNumber')
  })

  it('encodes identifiers in the resource path', async () => {
    const service = setupService()
    const encodedId = 'unit / دمشق'
    let requestedPath: string | null = null

    server.use(
      http.get(
        `${API_BASE_URL}/organizational-units/${encodeURIComponent(encodedId)}`,
        ({ request }) => {
          requestedPath = new URL(request.url).pathname
          return okJson(wireUnit())
        },
      ),
    )

    await service.getOrganizationalUnit(encodedId)

    expect(requestedPath).toBe(`/api/v1/organizational-units/${encodeURIComponent(encodedId)}`)
  })

  it('maps external-party detail, creation, and update operations to their contract endpoints', async () => {
    const service = setupService()
    const externalParty = createExternalParty({ code: 'EXT-UPDATED' })
    const externalPartyId = 'external / دمشق'
    // Create and update are NOT the same body any more: update additionally
    // requires `expectedRowVersion`, create must not carry a version or a status.
    // A single shared literal here is what let the retired upsert type pass.
    const createRequest = {
      code: externalParty.code ?? null,
      contactInfo: externalParty.contactInfo ?? null,
      nameAr: externalParty.nameAr,
      notes: externalParty.notes ?? null,
    }
    const updateRequest = { ...createRequest, expectedRowVersion: externalParty.rowVersion }
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/external-parties/${encodeURIComponent(externalPartyId)}`, () =>
        okJson(externalParty),
      ),
      http.post(`${API_BASE_URL}/external-parties`, async ({ request: httpRequest }) => {
        receivedBodies.push(await httpRequest.json())
        // `Result<Guid>` answers `{ id }` — NOT the created record. A fixture
        // that echoes the whole party here is what let the service type its
        // creates as `Promise<ExternalParty>` and hand callers a record the
        // server never sent.
        return apiJson({ id: externalParty.id }, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/external-parties/${encodeURIComponent(externalPartyId)}`,
        async ({ request: httpRequest }) => {
          receivedBodies.push(await httpRequest.json())
          // A plain `Result` handler answers with an EMPTY body.
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(service.getExternalParty(externalPartyId)).resolves.toEqual(externalParty)
    await expect(service.createExternalParty(createRequest)).resolves.toEqual({
      id: externalParty.id,
    })
    await expect(
      service.updateExternalParty(externalPartyId, updateRequest),
    ).resolves.toBeUndefined()
    expect(receivedBodies).toEqual([createRequest, updateRequest])
  })

  it('deactivates an external party through the status route with the required body', async () => {
    const service = setupService()
    const externalParty = createExternalParty()
    let requestedMethod: string | null = null
    let requestedPath: string | null = null
    const receivedBodies: unknown[] = []

    server.use(
      http.put(
        `${API_BASE_URL}/external-parties/${externalParty.id}/status`,
        async ({ request }) => {
          requestedMethod = request.method
          requestedPath = new URL(request.url).pathname
          receivedBodies.push(await request.json())
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(
      service.setExternalPartyStatus(externalParty.id, {
        status: 1,
        expectedRowVersion: externalParty.rowVersion,
      }),
    ).resolves.toBeUndefined()
    expect(requestedMethod).toBe('PUT')
    expect(requestedPath).toBe(`/api/v1/external-parties/${externalParty.id}/status`)
    // Both members are REQUIRED by `RequestBody([JsonRequired] int Status, int ExpectedRowVersion)`,
    // and the status is the enum ORDINAL — not the `"Inactive"` string the
    // projection serves, which ASP.NET cannot convert to `int`.
    expect(receivedBodies).toEqual([{ status: 1, expectedRowVersion: externalParty.rowVersion }])
  })

  it('leaves contract errors for the shared Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/sites/${fixtureUuid(999)}`, () =>
        errJson(404, { code: 'SITES_NOT_FOUND', message: 'Site not found.' }),
      ),
    )

    const error = await service.getSite(fixtureUuid(999)).catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    // `code` is nested under `error` on the wire; the old fixture put it at the
    // top level of a hand-rolled body, so the normalizer resolved it to null.
    expect(normalizeApiError(error)).toMatchObject({ status: 404, code: 'SITES_NOT_FOUND' })
  })
})
