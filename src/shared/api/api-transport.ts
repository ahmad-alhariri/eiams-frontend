import type { ApiSuccessResponse, ApiPage } from './api-contracts'

export interface ApiRequest<TBody = unknown> {
  readonly path: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: Readonly<TBody>
}

export interface ApiTransport {
  request<TResponse, TBody = unknown>(
    request: ApiRequest<TBody>,
  ): Promise<ApiSuccessResponse<TResponse>>

  requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>>

  requestEmpty<TBody = unknown>(request: Readonly<ApiRequest<TBody>>): Promise<void>
}
