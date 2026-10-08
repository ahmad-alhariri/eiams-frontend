import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { ApiSuccessResponse, ApiPage } from './api-contracts'
import type { ApiRequest } from './api-transport'
import { propagateRequestId } from './request-id'
import { normalizePagination } from './pagination'

/**
 * Projects an `ApiRequest` onto an Axios config.
 *
 * This was three near-identical inline literals, one per method. That is the
 * shape a divergence takes form in: when `signal` was added to `ApiRequest` for
 * `eiams-frontend-whhu.13`, the three blocks had to be edited in lockstep, and
 * nothing but review would have caught a missed one. Each property is spread
 * conditionally rather than assigned `undefined`, because Axios treats an
 * explicit `params: undefined` differently from an absent key and
 * `exactOptionalPropertyTypes` forbids the shorthand either way.
 */
/**
 * `AxiosRequestConfig['headers']` is typed as `T | undefined`, so casting to
 * it produced a value carrying an explicit `undefined`, which
 * `exactOptionalPropertyTypes` rejects when the key is conditionally spread.
 * These aliases name the NON-optional member types instead.
 */
type AxiosHeadersValue = NonNullable<AxiosRequestConfig['headers']>
type AxiosParamsValue = NonNullable<AxiosRequestConfig['params']>
type AxiosDataValue = NonNullable<AxiosRequestConfig['data']>

function toAxiosConfig<TBody>(request: Readonly<ApiRequest<TBody>>): AxiosRequestConfig<TBody> {
  return {
    url: request.path,
    method: request.method,
    ...(request.query !== undefined ? { params: request.query as AxiosParamsValue } : {}),
    ...(request.headers !== undefined ? { headers: request.headers as AxiosHeadersValue } : {}),
    ...(request.body !== undefined ? { data: request.body as AxiosDataValue } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
  }
}

export function createAxiosTransport(client: AxiosInstance) {
  return {
    /**
     * Returns the PAYLOAD, not the envelope.
     *
     * `requestPage` and `requestEmpty` already return unwrapped values, so
     * returning `ApiSuccessResponse<TResponse>` here made this one method of the
     * three the odd one out. It was also the reason the defect class t77l exists
     * to eliminate could not be closed: Axios's own response also exposes `.data`,
     * so a service could read `response.data` off the envelope (correct) and a
     * cast `AxiosInstance as ApiTransport` could pass review while throwing
     * `requestPage is not a function` at runtime. With the payload returned
     * directly, `.data` in a service is never legitimate, which makes the guard
     * in `eslint.config.js` a single AST rule that needs no type information.
     *
     * Anything that needs envelope internals — `request_id`, `meta` — must go
     * through `propagateRequestId()` or a dedicated method, never by reaching
     * into the envelope here in a service.
     */
    async request<TResponse, TBody = unknown>(request: ApiRequest<TBody>): Promise<TResponse> {
      const response = await client.request<ApiSuccessResponse<TResponse>>(toAxiosConfig(request))
      propagateRequestId()
      return response.data.data
    },

    async requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>> {
      const response = await client.request<ApiSuccessResponse<ReadonlyArray<TItem>>>(
        toAxiosConfig(request),
      )
      propagateRequestId()
      const pagination = normalizePagination(response.data.pagination)
      return {
        items: (response.data.data as ReadonlyArray<TItem>) ?? [],
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        hasPreviousPage: pagination.hasPreviousPage,
        hasNextPage: pagination.hasNextPage,
      }
    },

    async requestEmpty<TBody>(request: Readonly<ApiRequest<TBody>>): Promise<void> {
      await client.request<void>(toAxiosConfig(request))
      propagateRequestId()
    },
  }
}
