import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import {
  IDEMPOTENCY_KEY_HEADER,
  createIdempotencyKey,
  isConflictError,
  withIdempotencyKey,
  withRowVersion,
} from '@/shared/services/mutation-safety'
import { createApiClient } from '@/shared/services/api.client'
import { okJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const IDEMPOTENCY_KEY = '7f5b16bc-3eb2-4c54-995f-a03342c441b9'

function responseError(data: unknown, status: number): AxiosError<unknown> {
  const response: AxiosResponse<unknown> = {
    data,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }

  return new AxiosError('request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

/** A real `ApiErrorResponse` body (ApiContracts.cs:32-38). */
function wireError(code: string) {
  return {
    success: false as const,
    error: {
      code,
      message: 'The request could not be completed.',
      details: {},
      request_id: 'mutation-safety-test',
    },
  }
}

describe('mutation safety helpers', () => {
  it('creates a UUID idempotency key per distinct action', () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue(IDEMPOTENCY_KEY)

    expect(createIdempotencyKey()).toBe(IDEMPOTENCY_KEY)
    expect(randomUUID).toHaveBeenCalledOnce()

    randomUUID.mockRestore()
  })

  it('reuses one idempotency key across retries and sends the exact contract header through Axios', async () => {
    const request = withIdempotencyKey(IDEMPOTENCY_KEY)
    const observedKeys: Array<string | null> = []
    const { client, dispose } = createApiClient({ baseURL: API_BASE_URL })
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/doc-1/post`, ({ request: httpRequest }) => {
        observedKeys.push(httpRequest.headers.get(IDEMPOTENCY_KEY_HEADER))
        // `okJson`: this test drives `client.post` directly, below the transport,
        // and asserts only on the header. The body was irrelevant to the
        // assertion but still had to be a shape the application can parse, so
        // that raising the assertion to cover the response does not immediately
        // find it broken.
        return okJson({ accepted: true })
      }),
    )

    try {
      await client.post('/warehouse-documents/doc-1/post', { rowVersion: 4 }, request.config)
      await client.post('/warehouse-documents/doc-1/post', { rowVersion: 4 }, request.config)
    } finally {
      dispose()
    }

    expect(request.idempotencyKey).toBe(IDEMPOTENCY_KEY)
    expect(observedKeys).toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY])
  })

  it('copies the returned row version into action payloads without changing the original data', () => {
    const action = { reason: 'تحديث السجل', rowVersion: 2 }

    expect(withRowVersion(action, 5)).toEqual({ reason: 'تحديث السجل', rowVersion: 5 })
    expect(action).toEqual({ reason: 'تحديث السجل', rowVersion: 2 })
  })

  it('recognizes only contract 409 conflicts and leaves their cause to the feature', () => {
    // Real nested envelopes. `lifecycle.conflict` and `validation.failed` were
    // invented codes that the API never emits, so nothing downstream could key on
    // them; the real vocabulary is 409 lifecycle conflicts vs 422 rejections.
    expect(
      isConflictError(responseError(wireError('WAREHOUSE_DOCUMENTS_INVALID_TRANSITION'), 409)),
    ).toBe(true)
    // A 422 is not a conflict: the row did not change, the request was rejected.
    expect(isConflictError(responseError(wireError('UNPROCESSABLE_ENTITY'), 422))).toBe(false)
    expect(isConflictError(new Error('offline'))).toBe(false)
  })
})
