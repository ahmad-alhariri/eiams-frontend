import type { ApiPage } from './api-contracts'

export interface ApiRequest<TBody = unknown> {
  readonly path: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: Readonly<TBody>
}

export interface ApiTransport {
  /**
   * Resolves to the PAYLOAD.
   *
   * All three methods unwrap: `request` to the resource, `requestPage` to a
   * normalized `ApiPage`, `requestEmpty` to `void`. Returning the envelope here
   * instead — as this signature once did — put the payload one `.data` hop away
   * under the same property name an Axios response uses, so the compiler could
   * not tell a correct unwrap from a forgotten one, and a cast
   * `AxiosInstance as ApiTransport` type-checked while failing at runtime. It
   * also made "no service returns `response.data`" impossible to enforce: the
   * rule could not distinguish reading the envelope from reading a payload field
   * named `data`.
   */
  request<TResponse, TBody = unknown>(request: ApiRequest<TBody>): Promise<TResponse>

  requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>>

  requestEmpty<TBody = unknown>(request: Readonly<ApiRequest<TBody>>): Promise<void>
}
