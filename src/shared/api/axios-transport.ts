import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type { ApiSuccessResponse, ApiPage } from './api-contracts'
import type { ApiRequest } from './api-transport'
import { propagateRequestId } from './request-id'
import { normalizePagination } from './pagination'

export function createAxiosTransport(client: AxiosInstance) {
  return {
    async request<TResponse, TBody = unknown>(
      request: ApiRequest<TBody>,
    ): Promise<ApiSuccessResponse<TResponse>> {
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
      const response = await client.request<TResponse>(config)
      propagateRequestId()
      return response.data as ApiSuccessResponse<TResponse>
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
