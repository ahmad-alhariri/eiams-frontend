import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import {
  IDEMPOTENCY_KEY_HEADER,
  createIdempotencyKey,
  createIdempotentRequest,
  isConflictError,
  withIdempotencyKey,
  withRowVersion,
} from '@/shared/services/mutation-safety'
import { createApiClient } from '@/shared/services/api.client'
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
        return HttpResponse.json({ accepted: true })
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

  it('generates a new context only when a separate action starts', () => {
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('7f5b16bc-3eb2-4c54-995f-a03342c441b9')
      .mockReturnValueOnce('077683c4-f5d5-433d-8f52-5c7fd98f542e')

    const first = createIdempotentRequest()
    const second = createIdempotentRequest()

    expect(first.idempotencyKey).not.toBe(second.idempotencyKey)
    expect(first.config.headers).toEqual({ [IDEMPOTENCY_KEY_HEADER]: first.idempotencyKey })
    expect(second.config.headers).toEqual({ [IDEMPOTENCY_KEY_HEADER]: second.idempotencyKey })

    randomUUID.mockRestore()
  })

  it('copies the returned row version into action payloads without changing the original data', () => {
    const action = { reason: 'تحديث السجل', rowVersion: 2 }

    expect(withRowVersion(action, 5)).toEqual({ reason: 'تحديث السجل', rowVersion: 5 })
    expect(action).toEqual({ reason: 'تحديث السجل', rowVersion: 2 })
  })

  it('recognizes only contract 409 conflicts and leaves their cause to the feature', () => {
    expect(
      isConflictError(
        responseError(
          {
            status: 409,
            code: 'lifecycle.conflict',
            titleAr: 'تغيرت حالة السند.',
            traceId: 'conflict-1',
          },
          409,
        ),
      ),
    ).toBe(true)
    expect(isConflictError(responseError({ code: 'validation.failed' }, 422))).toBe(false)
    expect(isConflictError(new Error('offline'))).toBe(false)
  })
})
