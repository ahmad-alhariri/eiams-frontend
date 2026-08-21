import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createReceivingService } from '@/modules/receiving/services/receiving.service'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createDevSession } from '@/shared/services/dev-session'
import type { AuthTokenResponse } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({
    baseURL: API_BASE_URL,
    refreshSession: async () => createDevSession() as AuthTokenResponse,
  })
  bundles.push(bundle)
  return createReceivingService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('ReceivingService', () => {
  it('maps the supplier-suggestion query to the contract endpoint and trims the result', async () => {
    const service = setupService()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/receiving/suppliers`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json(['مورد الشام', 'مورد النور'])
      }),
    )

    await expect(service.searchReceivingSuppliers('شام')).resolves.toEqual([
      'مورد الشام',
      'مورد النور',
    ])
    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/receiving/suppliers?search=${encodeURIComponent('شام')}`,
    ])
  })

  it('propagates a 401 as a normalized API error for the consuming hook to surface', async () => {
    const service = setupService()
    server.use(
      http.get(`${API_BASE_URL}/receiving/suppliers`, () =>
        HttpResponse.json({ title: 'غير مصرح', status: 401 }, { status: 401 }),
      ),
    )

    await expect(service.searchReceivingSuppliers('شام')).rejects.toMatchObject({
      response: { status: 401, data: { status: 401, title: 'غير مصرح' } },
    })
  })

  it('exposes the shared singleton wired to the configured API client', async () => {
    const { receivingService } = await import('@/modules/receiving/services/receiving.service')
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/receiving/suppliers`, ({ request }) => {
        requestedUrls.push(new URL(request.url).search)
        return HttpResponse.json(['مورد الشام'])
      }),
    )

    await expect(receivingService.searchReceivingSuppliers('شام')).resolves.toEqual(['مورد الشام'])
    expect(requestedUrls).toEqual([`?search=${encodeURIComponent('شام')}`])
  })
})
