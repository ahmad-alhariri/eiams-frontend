import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { ApiSuccessResponse, ApiPage } from './api-contracts'
import type { ApiRequest } from './api-transport'
import { propagateRequestId } from './request-id'
import { normalizePagination } from './pagination'

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
      const config = {
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
      const response = await client.request<ApiSuccessResponse<TResponse>>(config)
      propagateRequestId()
      return response.data.data
    },

    async requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>> {
      const config = {
        url: request.path,
        method: request.method,
        ...(request.query !== undefined
          ? { params: request.query as AxiosRequestConfig['params'] }
          : {}),
        ...(request.headers !== undefined
          ? { headers: request.headers as AxiosRequestConfig['headers'] }
          : {}),
        ...(request.body !== undefined ? { data: request.body as AxiosRequestConfig['data'] } : {}),
      } as AxiosRequestConfig
      const response = await client.request<ApiSuccessResponse<ReadonlyArray<TItem>>>(config)
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
      const config = {
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
      await client.request<void>(config)
      propagateRequestId()
    },
  }
}
