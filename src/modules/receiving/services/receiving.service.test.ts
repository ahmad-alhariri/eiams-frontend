import { createAxiosTransport } from '@/shared/api/axios-transport'
import { errJson, okJson } from '@/test/msw/envelope'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createReceivingService,
  receivingService,
  type SupplierSuggestion,
} from '@/modules/receiving/services/receiving.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createDevSession } from '@/shared/services/dev-session'

import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

// The live route, verified in `eiams-frontend-67ky`: the provisional snapshot's
// `GET /receiving/suppliers` never existed on the backend, so a handler mocking
// that path left MSW with an unhandled request — which the transport surfaces as
// `AxiosError: Network Error`, not as a wrong-shape assertion.
const SUPPLIERS_PATH = `${API_BASE_URL}/receiving-infos/suppliers`

const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({
    baseURL: API_BASE_URL,
    refreshSession: async () => createDevSession(),
  })
  bundles.push(bundle)
  return createReceivingService(createAxiosTransport(bundle.client))
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

/** `SupplierSuggestionResponse` as the backend serves it — the supplier NAME only. */
function createSupplierSuggestion(overrides: Partial<SupplierSuggestion> = {}): SupplierSuggestion {
  return { name: 'مورد الشام', ...overrides }
}

describe('ReceivingService', () => {
  it('maps the supplier-suggestion query to the contract endpoint and returns the typed rows', async () => {
    const service = setupService()
    const requestedUrls: string[] = []
    const suppliers = [createSupplierSuggestion(), createSupplierSuggestion({ name: 'مورد النور' })]

    server.use(
      http.get(SUPPLIERS_PATH, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        // The envelope is what the API sends; the transport unwraps `data`, so the
        // service hands back the suggestion rows themselves.
        return okJson(suppliers)
      }),
    )

    await expect(service.searchReceivingSuppliers('شام')).resolves.toEqual(suppliers)
    expect(requestedUrls).toEqual([`${SUPPLIERS_PATH}?search=${encodeURIComponent('شام')}`])
  })

  it('propagates a 401 as a normalized API error for the consuming hook to surface', async () => {
    const service = setupService()

    server.use(
      http.get(SUPPLIERS_PATH, () =>
        errJson(401, {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'The request requires an authenticated session.',
          detail: 'غير مصرح',
        }),
      ),
    )

    const error = await service
      .searchReceivingSuppliers('شام')
      .then(() => null)
      .catch((caught: unknown) => caught)

    // The service translates nothing: it rejects with the raw transport error, so
    // the assertion is on the status and the nested code the hook boundary reads.
    expect(error).toMatchObject({ response: { status: 401 } })
    expect(normalizeApiError(error)).toMatchObject({
      kind: 'problem',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    })
  })

  it('exposes the shared singleton wired to the configured API client', async () => {
    const requestedUrls: string[] = []
    const supplier = createSupplierSuggestion()

    server.use(
      http.get(SUPPLIERS_PATH, ({ request }) => {
        requestedUrls.push(new URL(request.url).search)
        return okJson([supplier])
      }),
    )

    // The singleton is built over `apiTransport` at module scope, so this fails
    // the moment the composition root loses its real three-method transport.
    await expect(receivingService.searchReceivingSuppliers('شام')).resolves.toEqual([supplier])
    expect(requestedUrls).toEqual([`?search=${encodeURIComponent('شام')}`])
  })
})
