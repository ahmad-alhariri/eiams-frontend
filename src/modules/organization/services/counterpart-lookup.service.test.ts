import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createCounterpartLookupService } from '@/modules/organization/services/counterpart-lookup.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { CounterpartOption, CounterpartPage } from '@/shared/types/generated/eiams-v1'
import { createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createCounterpartLookupService(bundle.client)
}

function createCounterpart(overrides: Partial<CounterpartOption> = {}): CounterpartOption {
  return {
    displayName: 'أحمد محمد',
    id: fixtureUuid(61),
    secondaryLabelAr: 'أمين مستودع',
    status: 'Active',
    type: 'Employee',
    ...overrides,
  }
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('CounterpartLookupService', () => {
  it('uses the contract search endpoint and preserves its scope filters', async () => {
    const service = setupService()
    const counterpart = createCounterpart()
    let requestedUrl = ''

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
        requestedUrl = new URL(request.url).toString()
        return HttpResponse.json(createPage([counterpart]) satisfies CounterpartPage)
      }),
    )

    await expect(
      service.searchCounterparts({
        pageIndex: 2,
        pageSize: 10,
        search: 'أحمد',
        siteId: fixtureUuid(62),
        type: 'Employee',
      }),
    ).resolves.toMatchObject({ items: [counterpart] })

    const url = new URL(requestedUrl)
    expect(url.searchParams.get('pageIndex')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('10')
    expect(url.searchParams.get('search')).toBe('أحمد')
    expect(url.searchParams.get('siteId')).toBe(fixtureUuid(62))
    expect(url.searchParams.get('type')).toBe('Employee')
  })

  it('resolves inactive historical counterpart references using encoded path values', async () => {
    const service = setupService()
    const counterpart = createCounterpart({
      id: 'external / 1',
      status: 'Inactive',
      type: 'External',
    })

    server.use(
      http.get(`${API_BASE_URL}/counterparts/External/${encodeURIComponent(counterpart.id)}`, () =>
        HttpResponse.json(counterpart),
      ),
    )

    await expect(
      service.resolveCounterpart({ type: counterpart.type, id: counterpart.id }),
    ).resolves.toEqual(counterpart)
  })

  it('leaves counterpart contract errors for the shared Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/counterparts/Employee/missing`, () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'counterpart.not_found',
            titleAr: 'الجهة غير موجودة.',
            traceId: 'counterpart-missing',
          },
          { status: 404 },
        ),
      ),
    )

    const error = await service
      .resolveCounterpart({ type: 'Employee', id: 'missing' })
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({ status: 404, code: 'counterpart.not_found' })
  })
})
