import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient } from '@/shared/services/api.client'
import type { ProblemDetails } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

const problemFixture: ProblemDetails = {
  status: 422,
  code: 'validation.failed',
  titleAr: 'تعذر حفظ البيانات',
  detailAr: 'راجع الحقول المحددة ثم حاول مجدداً.',
  traceId: 'trace-422',
  fieldErrors: [
    { field: 'nameAr', code: 'required', messageAr: 'الاسم العربي مطلوب.' },
    { field: 'nameAr', code: 'duplicate', messageAr: 'الاسم العربي مستخدم.' },
  ],
}

function responseError(data: unknown, status: number): AxiosError<unknown> {
  const response: AxiosResponse<unknown> = {
    data,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }

  return new AxiosError(
    'private backend detail',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    response,
  )
}

describe('normalizeApiError', () => {
  it('returns the contract Arabic presentation and ordered field errors', () => {
    expect(normalizeApiError(responseError(problemFixture, 422))).toEqual({
      kind: 'problem',
      status: 422,
      code: 'validation.failed',
      titleAr: 'تعذر حفظ البيانات',
      detailAr: 'راجع الحقول المحددة ثم حاول مجدداً.',
      traceId: 'trace-422',
      fieldErrors: problemFixture.fieldErrors,
    })
  })

  it('uses safe Arabic fallbacks without leaking malformed server payloads', () => {
    const normalized = normalizeApiError(
      responseError(
        {
          status: 500,
          code: 'server.failure',
          titleAr: 'SQL exception: secret table',
          traceId: '',
        },
        500,
      ),
    )

    expect(normalized).toMatchObject({
      kind: 'problem',
      status: 500,
      code: 'server.failure',
      titleAr: 'تعذر إتمام العملية حالياً.',
      traceId: null,
      fieldErrors: [],
    })
    expect(JSON.stringify(normalized)).not.toContain('SQL exception')
  })

  it('uses the documented authentication fallback when a malformed response carries a safe code', () => {
    expect(
      normalizeApiError(responseError({ code: 'auth.invalid_credentials' }, 401)),
    ).toMatchObject({
      status: 401,
      code: 'auth.invalid_credentials',
      titleAr: 'بيانات تسجيل الدخول غير صحيحة.',
    })
  })

  it('ignores invalid optional field errors and a status-mismatched problem body', () => {
    const invalidFields = normalizeApiError(
      responseError(
        {
          ...problemFixture,
          fieldErrors: [{ field: 'nameAr', code: 'required', messageAr: '' }],
        },
        422,
      ),
    )
    const mismatchedStatus = normalizeApiError(
      responseError({ ...problemFixture, status: 409 }, 422),
    )

    expect(invalidFields.fieldErrors).toEqual([])
    expect(mismatchedStatus).toMatchObject({
      status: 422,
      titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
      traceId: null,
    })
  })

  it('copies only contracted field-error properties from an otherwise valid payload', () => {
    const normalized = normalizeApiError(
      responseError(
        {
          ...problemFixture,
          fieldErrors: [
            {
              field: 'nameAr',
              code: 'required',
              messageAr: 'الاسم العربي مطلوب.',
              internalDetail: 'secret value',
            },
          ],
        },
        422,
      ),
    )

    expect(normalized.fieldErrors).toEqual([
      { field: 'nameAr', code: 'required', messageAr: 'الاسم العربي مطلوب.' },
    ])
    expect(JSON.stringify(normalized)).not.toContain('secret value')
  })

  it('maps network and unknown errors to safe Arabic feedback', () => {
    const network = normalizeApiError(new AxiosError('socket password=secret', 'ERR_NETWORK'))
    const unknown = normalizeApiError(new Error('internal failure: secret'))

    expect(network).toMatchObject({
      kind: 'network',
      status: null,
      titleAr: 'تعذر الاتصال بالخدمة',
    })
    expect(unknown).toMatchObject({
      kind: 'unexpected',
      status: null,
      titleAr: 'حدث خطأ غير متوقع',
    })
    expect(JSON.stringify([network, unknown])).not.toContain('secret')
  })

  it('normalizes an MSW ProblemDetails response from the shared Axios client', async () => {
    const { client, dispose } = createApiClient({ baseURL: API_BASE_URL })
    server.use(
      http.get(`${API_BASE_URL}/validation-example`, () =>
        HttpResponse.json(problemFixture, { status: 422 }),
      ),
    )

    try {
      await client.get('/validation-example')
    } catch (error: unknown) {
      expect(normalizeApiError(error)).toMatchObject({
        kind: 'problem',
        status: 422,
        titleAr: 'تعذر حفظ البيانات',
        fieldErrors: problemFixture.fieldErrors,
      })
      return
    } finally {
      dispose()
    }

    throw new Error('Expected the validation request to reject.')
  })
})
