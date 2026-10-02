import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  counterpartLookupService,
  setCounterpartLookupService,
} from '@/modules/organization/services/counterpart-lookup.service'
import type { ExternalParty } from '@/modules/organization/types/organization.types'
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

function createExternalParty(overrides: Partial<ExternalParty> = {}): ExternalParty {
  return {
    externalPartyId: fixtureUuid(61),
    code: 'EXT-001',
    nameAr: 'أحمد محمد',
    contactInfo: null,
    notes: null,
    rowVersion: 1,
    status: 'Active',
    ...overrides,
  }
}

describe('CounterpartLookupService', () => {
  it('searches external parties with the contract query parameters', async () => {
    const service = setupService()
    const party = createExternalParty()
    let requestedUrl = ''

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        requestedUrl = new URL(request.url).toString()
        return HttpResponse.json({ items: [party], page: 0, pageSize: 100 })
      }),
    )

    await expect(
      service.searchCounterparts({ search: 'أحمد', status: 'Active' }),
    ).resolves.toMatchObject([party])

    const url = new URL(requestedUrl)
    expect(url.pathname).toBe(`${API_BASE_URL}/external-parties`)
    expect(url.searchParams.get('search')).toBe('أحمد')
    expect(url.searchParams.get('status')).toBe('Active')
    expect(url.searchParams.get('pageSize')).toBe('100')
  })

  it('resolves a single external party by id', async () => {
    const service = setupService()
    const party = createExternalParty({ externalPartyId: 'external / 1' })

    server.use(
      http.get(
        `${API_BASE_URL}/external-parties/${encodeURIComponent(party.externalPartyId)}`,
        () => HttpResponse.json(party),
      ),
    )

    await expect(
      service.resolveCounterpart({ type: 'ExternalParty', id: party.externalPartyId }),
    ).resolves.toEqual(party)
  })

  it('accepts a plain string id for resolveCounterpart', async () => {
    const service = setupService()
    const party = createExternalParty({ externalPartyId: fixtureUuid(99) })

    server.use(
      http.get(
        `${API_BASE_URL}/external-parties/${encodeURIComponent(party.externalPartyId)}`,
        () => HttpResponse.json(party),
      ),
    )

    await expect(service.resolveCounterpart(party.externalPartyId)).resolves.toEqual(party)
  })
})
