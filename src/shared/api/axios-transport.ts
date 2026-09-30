import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { ApiSuccessResponse, ApiPage } from './api-contracts'
import type { ApiRequest } from './api-transport'
import { propagateRequestId } from './request-id'
import { normalizePagination } from './pagination'

/**
 * Builds the axios config for one transport call.
 *
 * Extracted 2026-09-30. The original repeated this identical eight-line object
 * three times, once per method, so a change to request shaping had to be made in
 * three places and two of them were easy to miss.
 *
 * `query`, `headers` and `body` are omitted when absent rather than sent as
 * `undefined`: axios serializes `{ page: undefined }` into the literal query
 * string `page=undefined`, which the backend then fails to bind.
 */
function toConfig<TBody>(request: Readonly<ApiRequest<TBody>>): AxiosRequestConfig<TBody> {
  return {
    url: request.path,
    method: request.method,
    ...(request.query !== undefined
      ? { params: request.query as AxiosRequestConfig['params'] }
      : {}),
    ...(request.headers !== undefined
      ? { headers: request.headers as AxiosRequestConfig['headers'] }
      : {}),
    ...(request.body !== undefined ? { data: request.body as AxiosRequestConfig['data'] } : {}),
  } as AxiosRequestConfig<TBody>
}

/**
 * Narrows an axios body to the backend's success envelope, or throws.
 *
 * This replaces `return response.data as ApiSuccessResponse<TResponse>`, which
 * was an unchecked cast: a non-envelope body — an HTML SPA fallback, a bare
 * health probe, a 204 with no content — would be silently typed as an envelope
 * and only fail later at some unrelated property access.
 *
 * The predicate is deliberately narrow. It accepts ONLY a success envelope with
 * a present `data` key, mirroring `isApiSuccessResponse` in `envelope.ts`, which
 * is verified against payloads captured from the running API.
 *
 * Two documented exceptions are NOT envelopes and must not be unwrapped:
 *   - `GET /api/v1/health[/live|/ready]`, which returns `{"status":"..."}`
 *   - `GET .../attachments/{id}/content`, which returns raw file bytes
 * Neither goes through `request()`; they use raw axios and handle their own
 * body. Every JSON endpoint the services call DOES return an envelope
 * (`ApiResults.Ok` -> `ApiResponse<T>`, `Web.Api/Infrastructure/ApiResults.cs:7`).
 */
function assertSuccessEnvelope<TResponse>(
  body: unknown,
  path: string,
): ApiSuccessResponse<TResponse> {
  const isEnvelope =
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === true &&
    'data' in (body as Record<string, unknown>)

  if (!isEnvelope) {
    throw new Error(
      `Transport expected a success envelope from ${path} but received ` +
        `${describe(body)}. A non-envelope response usually means the request ` +
        `bypassed the API prefix, or a proxy returned an HTML fallback page.`,
    )
  }

  return body as ApiSuccessResponse<TResponse>
}

function describe(body: unknown): string {
  if (typeof body === 'string') {
    return `a ${body.length}-character string (${body.slice(0, 80)})`
  }
  if (body === null || body === undefined) {
    return String(body)
  }
  if (typeof body === 'object') {
    return `an object with keys [${Object.keys(body as object).join(', ')}]`
  }
  return typeof body
}

export function createAxiosTransport(client: AxiosInstance) {
  return {
    async request<TResponse, TBody = unknown>(
      request: ApiRequest<TBody>,
    ): Promise<ApiSuccessResponse<TResponse>> {
      const response = await client.request<unknown>(toConfig(request))
      propagateRequestId()
      return assertSuccessEnvelope<TResponse>(response.data, request.path)
    },

    async requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>> {
      const response = await client.request<unknown>(toConfig(request))
      propagateRequestId()

      const envelope = assertSuccessEnvelope<ReadonlyArray<TItem>>(response.data, request.path)
      const pagination = normalizePagination(envelope.pagination)

      // `?? []` because `ApiResults.Ok` may legitimately send `data: null` for a
      // resultless 200, and a list page must render rather than crash.
      return {
        items: envelope.data ?? [],
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        hasPreviousPage: pagination.hasPreviousPage,
        hasNextPage: pagination.hasNextPage,
      }
    },

    /**
     * For endpoints whose success carries no payload: 204s, and ordinary
     * resultless commands that the backend answers with 200 and `data: null`
     * (`ApiResults.Success`, `ApiResults.cs:10-17`). No unwrap, because there is
     * nothing to unwrap.
     */
    async requestEmpty<TBody = unknown>(request: Readonly<ApiRequest<TBody>>): Promise<void> {
      await client.request<unknown>(toConfig(request))
      propagateRequestId()
    },
  }
}
