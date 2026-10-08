import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  counterpartLookupService,
  setCounterpartLookupService,
} from '@/modules/organization/services/counterpart-lookup.service'
import type { CounterpartResolution } from '@/modules/organization/types/counterpart-lookup.types'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

const API_BASE_URL = '/api/v1'

// A real transport over a real Axios client (9uuf); the previous cast supplied
// none of requestPage/request/requestEmpty while satisfying the type.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  setCounterpartLookupService(transport)
  return counterpartLookupService
}

/**
 * Mirrors `Application/Abstractions/Recipients/CounterpartResolution.cs`.
 * The previous typed shape (`ExternalParty`) targeted `/external-parties`, a
 * route the backend serves for the admin ExternalParty CRUD aggregate, not for
 * the polymorphic counterpart write-flow read. The live wire is
 * `GET /counterparts?operation=&type=&search=&page=&pageSize=`, so this
 * factory emits a `CounterpartResolution` instead.
 */
function createCounterpart(overrides: Partial<CounterpartResolution> = {}): CounterpartResolution {
  return {
    type: 'External',
    id: fixtureUuid(61),
    displayName: 'أحمد محمد',
    secondaryLabelAr: null,
    status: 'Active',
    ...overrides,
  }
}

describe('CounterpartLookupService', () => {
  it('searches the polymorphic /counterparts endpoint with operation+type+search', async () => {
    const service = setupService()
    const counterpart = createCounterpart()
    let requestedUrl = ''

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
        requestedUrl = new URL(request.url).toString()
        return okPageJson([counterpart], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
    )

    await expect(
      service.searchCounterparts({ operation: 'Receiving', type: 'External', search: 'أحمد' }),
    ).resolves.toMatchObject([counterpart])

    const url = new URL(requestedUrl)
    expect(url.pathname).toBe(`${API_BASE_URL}/counterparts`)
    expect(url.searchParams.get('operation')).toBe('Receiving')
    expect(url.searchParams.get('type')).toBe('External')
    expect(url.searchParams.get('search')).toBe('أحمد')
    // The write selector narrows to ten; the backend caps at its own limit
    // but a single-page request at ten is the documented default.
    expect(url.searchParams.get('pageSize')).toBe('10')
    expect(url.searchParams.get('page')).toBe('1')
  })

  it('omits the search param when the search string is empty', async () => {
    const service = setupService()
    let requestedUrl = ''

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
        requestedUrl = new URL(request.url).toString()
        return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
      }),
    )

    await expect(
      service.searchCounterparts({ operation: 'Issue', type: 'Employee' }),
    ).resolves.toEqual([])

    const url = new URL(requestedUrl)
    expect(url.searchParams.has('search')).toBe(false)
    expect(url.searchParams.get('operation')).toBe('Issue')
    expect(url.searchParams.get('type')).toBe('Employee')
  })

  it('resolves a single counterpart by type + id', async () => {
    const service = setupService()
    const counterpart = createCounterpart({ type: 'Employee', id: fixtureUuid(74) })

    server.use(
      http.get(
        `${API_BASE_URL}/counterparts/${encodeURIComponent(counterpart.type)}/${encodeURIComponent(counterpart.id)}`,
        () => okJson(counterpart),
      ),
    )

    await expect(
      service.resolveCounterpart({ type: counterpart.type, id: counterpart.id }),
    ).resolves.toEqual(counterpart)
  })

  it('rejects the retired bare-id form of resolveCounterpart with a descriptive error', async () => {
    const service = setupService()
    // The previous ExternalParty lookup accepted a bare string id; the
    // polymorphic counterpart route requires a `{type, id}` reference because
    // the backend path is `/counterparts/{type}/{counterpartId}` and the
    // `type` segment is needed to disambiguate Employee/Site/OrgUnit/External.
    await expect(service.resolveCounterpart('any-id' as unknown as never)).rejects.toThrow(
      /structured CounterpartReference/,
    )
  })
})
