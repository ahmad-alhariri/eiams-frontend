import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { GATEWAY_PROBLEM_DETAIL_AR, GATEWAY_PROBLEM_TITLE_AR } from '@/shared/services/api.client'
import { normalizeApiError, type ApiError } from '@/shared/services/api-error'
import { readRequestIdFromMeta } from '@/shared/api/request-id'
import { readTransportError } from '@/shared/api/envelope'
import { errJson, okJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

/**
 * The transport's failure surface, against the real wire.
 *
 * WHY THIS FILE EXISTS ALONGSIDE `transport-seam.test.ts`.
 *
 * `transport-seam` proves the seam is real: that a service reaches the network
 * through a genuine transport rather than a cast. This file covers what happens
 * when the network answers with something other than a success envelope — the
 * cases where `AxiosError.response` is absent, is a non-JSON body, or carries a
 * status the application must classify.
 *
 * The gap this filled was not hypothetical. `whhu.13`'s acceptance criteria name
 * "network, 400/401/403/404/409/429, request ID, cancellation, and bearer-header
 * behavior", and a grep for `status: (400|404|409|429)`, `ERR_NETWORK`,
 * `AbortController` and `429` across the test tree returned nothing. Every
 * error test that existed constructed an `AxiosError` by hand in
 * `api-error.test.ts`, which means the normalization logic was pinned while the
 * thing that PRODUCES those errors — the interceptor chain in `api.client.ts` and
 * the envelope unwrap in `axios-transport.ts` — was never exercised failing.
 *
 * `api.client.test.ts` does cover the 401 refresh-and-retry chain, and that
 * coverage is real; it is not duplicated here. What was missing is everything
 * BELOW the interceptor: the statuses that must pass straight through, the
 * failure with no HTTP response at all, and the HTML that a misrouted proxy
 * returns with a 200.
 */

const API_BASE_URL = '/api/v1'
const createHarness = registerTestTransportHarness(API_BASE_URL)

describe('transport — the request ID reaches diagnostics', () => {
  it('reads request_id from success meta and from an error envelope', async () => {
    // `propagateRequestId` is a documented no-op hook, so the transport cannot
    // be the assertion point here. What must hold is that `readRequestIdFromMeta`
    // recovers the id from BOTH shapes the API emits — `meta.request_id` on
    // success and `error.request_id` on failure — because that is the only way a
    // support correlation id survives to the UI.
    expect(readRequestIdFromMeta({ request_id: 'abc-123', timestamp: 't' })).toBe('abc-123')
    expect(readRequestIdFromMeta({})).toBe('gateway-unknown-request-id')
    expect(readRequestIdFromMeta({ request_id: 42 })).toBe('gateway-unknown-request-id')
    expect(readRequestIdFromMeta(null)).toBe('gateway-unknown-request-id')
  })

  it('surfaces a failed response request_id as the trace id', async () => {
    const { transport } = createHarness()

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'WAREHOUSES_NOT_FOUND',
              message: 'Not found',
              details: {},
              request_id: 'trace-from-the-wire',
            },
          },
          { status: 404 },
        ),
      ),
    )

    const error = await transport
      .request({ path: '/inventory/balances', method: 'GET' })
      .catch((reason: unknown) => reason)

    expect(normalizeApiError(error).traceId).toBe('trace-from-the-wire')
    expect(readTransportError(error)).toEqual({ status: 404, code: 'WAREHOUSES_NOT_FOUND' })
  })
})

describe('transport — statuses that must pass straight through', () => {
  /**
   * Each case states the one thing that is specific to it, so a failure names
   * the behaviour that broke rather than "expected 409, received 403".
   */
  const cases: readonly {
    status: number
    code: string
    why: string
  }[] = [
    {
      status: 400,
      code: 'REQUEST_VALIDATION_FAILED',
      why: 'validation failure, whose details map to form fields',
    },
    { status: 403, code: 'AUTHORIZATION_FORBIDDEN', why: 'scope denial' },
    { status: 404, code: 'RESOURCE_NOT_FOUND', why: 'a genuinely absent entity' },
    { status: 409, code: 'RESOURCE_CONFLICT', why: 'a state conflict, not a retryable fault' },
    { status: 429, code: 'RATE_LIMIT_EXCEEDED', why: 'throttling, which must not trigger refresh' },
  ]

  it.each(cases)(
    'propagates $status $code without attempting a refresh ($why)',
    async ({ status, code }) => {
      const { transport, bundle } = createHarness()
      let refreshCalls = 0

      server.use(
        http.get(`${API_BASE_URL}/inventory/balances`, () => errJson(status, { code })),
        http.post(`${API_BASE_URL}/auth/refresh`, () => {
          refreshCalls += 1
          return okJson({})
        }),
      )

      const error = await transport
        .request({ path: '/inventory/balances', method: 'GET' })
        .catch((reason: unknown) => reason)

      expect(normalizeApiError(error).status).toBe(status)
      expect(normalizeApiError(error).code).toBe(code)
      // The one-flight refresh is reserved for 401. A 429 that triggered it
      // would turn backpressure into a second authenticated request and
      // deepen the throttling it is meant to relieve.
      expect(refreshCalls).toBe(0)
      bundle.dispose()
    },
  )

  it('maps a 400 details map onto form field names', async () => {
    const { transport } = createHarness()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'REQUEST_VALIDATION_FAILED',
              message: 'One or more request values are invalid.',
              details: { 'body.code': ['The Code field is required.'] },
              request_id: 'validation-request-id',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const error = await transport
      .request({ path: '/warehouses', method: 'GET' })
      .catch((reason: unknown) => reason)

    const normalized = normalizeApiError(error)

    expect(normalized.fieldErrors).toHaveLength(1)
    // `body.code` is reduced to `code` so `setFormServerErrors` can match it
    // against the form's own field name; keeping the prefix lights nothing.
    expect(normalized.fieldErrors[0]?.field).toBe('code')
  })
})

describe('transport — failures with no usable HTTP response', () => {
  it('reports a network failure as kind=network with no status', async () => {
    const { transport } = createHarness()

    server.use(http.get(`${API_BASE_URL}/inventory/balances`, () => HttpResponse.error()))

    const error = await transport
      .request({ path: '/inventory/balances', method: 'GET' })
      .catch((reason: unknown) => reason)

    const normalized = normalizeApiError(error)

    // No `response` at all, which is the branch `readTransportError` returns
    // null for. A status is NOT invented to fill the gap.
    expect(normalized.kind).toBe('network')
    expect(normalized.status).toBeNull()
    expect(normalized.code).toBeNull()
    expect(readTransportError(error)).toBeNull()
  })

  it('rejects a 200 text/html body as a 502 gateway problem instead of resolving a string', async () => {
    const { transport } = createHarness()

    server.use(
      // What a missing backend or a misrouted proxy returns: the SPA index page.
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.text('<!doctype html><html><body>EIAMS</body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )

    const error = await transport
      .request({ path: '/inventory/balances', method: 'GET' })
      .catch((reason: unknown) => reason)

    const normalized = normalizeApiError(error)

    // Without the interceptor this resolves to the HTML STRING, and the first
    // `.map` in a consuming list throws `map is not a function` — an error that
    // names the wrong file entirely.
    expect(normalized.status).toBe(502)
    // This is the assertion that caught the flat/nested defect: the synthesized
    // body carried `code` at the top level, so `readApiError` read it as absent
    // and every field below silently came back null or generic.
    expect(normalized.code).toBe('GATEWAY_UNEXPECTED_RESPONSE')
    expect(normalized.titleAr).toBe(GATEWAY_PROBLEM_TITLE_AR)
    expect(normalized.detailAr).toBe(GATEWAY_PROBLEM_DETAIL_AR)
    // The correlation id exists so a user report is actionable; on this path it
    // was being dropped, because it sat on a field nothing read.
    expect(normalized.traceId).toMatch(/^gateway-/u)
  })

  it('is distinguishable from a real 502 server fault', async () => {
    // The point of a dedicated code is that a routing problem and a genuine
    // server fault do not read identically. Both arrive as HTTP 502, so the
    // status alone cannot separate them — only the code can.
    const { transport } = createHarness()

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) =>
        request.headers.get('x-case') === 'html'
          ? HttpResponse.text('<!doctype html><html></html>')
          : errJson(502, { code: 'SERVER_FAILURE' }),
      ),
    )

    // Both branches reject, so the catch handler is the normal path. Typed
    // explicitly because `catch` returns `T | ApiError` and the union is
    // unusable at the property access below.
    const failing = async (headers?: Readonly<Record<string, string>>): Promise<ApiError> =>
      transport
        .request({ path: '/inventory/balances', method: 'GET', ...(headers ? { headers } : {}) })
        .then(
          () => {
            throw new Error('expected the request to fail')
          },
          (reason: unknown) => normalizeApiError(reason),
        )

    const asHtml = await failing({ 'x-case': 'html' })
    const asServerFault = await failing()

    expect(asHtml.status).toBe(asServerFault.status)
    expect(asHtml.code).not.toBe(asServerFault.code)
    expect(asHtml.titleAr).not.toBe(asServerFault.titleAr)
  })

  it('still resolves a 204 empty body', async () => {
    const { transport } = createHarness()

    server.use(
      http.delete(`${API_BASE_URL}/warehouses/wh-1`, () => new HttpResponse(null, { status: 204 })),
    )

    // A 204 is the one non-JSON body that is legitimate, so the HTML guard must
    // not claim it.
    await expect(
      transport.requestEmpty({ path: '/warehouses/wh-1', method: 'DELETE' }),
    ).resolves.toBeUndefined()
  })
})

describe('transport — cancellation', () => {
  it('rejects with CanceledError once the caller aborts', async () => {
    const { transport } = createHarness()
    const controller = new AbortController()

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, async () => {
        // Hold the response open until the abort lands, so the abort is what
        // ends the request rather than the handler returning first.
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return okJson({ tooLate: true })
      }),
    )

    const pending = transport.request({
      path: '/inventory/balances',
      method: 'GET',
      signal: controller.signal,
    })

    controller.abort()

    const error = await pending.catch((reason: unknown) => reason)

    // Rejecting rather than resolving matters: a cancelled read that resolved
    // would hand the caller data it has already discarded, and a query that
    // unmounted mid-flight would write it into the cache.
    expect(axiosIsCanceled(error)).toBe(true)
  })

  it('resolves normally when the signal never aborts', async () => {
    const { transport } = createHarness()
    const controller = new AbortController()

    server.use(http.get(`${API_BASE_URL}/inventory/balances`, () => okJson({ balances: [] })))

    // The non-vacuity half: a signal that never fires must not break the
    // ordinary path, or "supports cancellation" would be indistinguishable
    // from "breaks every request".
    const result = await transport.request<{ balances: readonly unknown[] }>({
      path: '/inventory/balances',
      method: 'GET',
      signal: controller.signal,
    })

    expect(result).toEqual({ balances: [] })
  })
})

function axiosIsCanceled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_CANCELED'
  )
}
