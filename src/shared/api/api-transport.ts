import type { ApiPage } from './api-contracts'

export interface ApiRequest<TBody = unknown> {
  readonly path: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: Readonly<TBody>
  /**
   * Aborts the request when the caller can no longer use the answer.
   *
   * Added for `eiams-frontend-whhu.13`, whose acceptance criteria name
   * cancellation, and it existed nowhere before: `ApiRequest` had no way to
   * cancel, so a TanStack Query unmount or a superseded keystroke could not
   * release the socket. `useQuery` already receives an `AbortSignal` in its
   * context and discards it, because no service could accept one.
   *
   * Axios has supported `signal` since 0.22 and rejects with
   * `CanceledError` rather than resolving a partial body, which is the
   * behaviour wanted here: a cancelled read must not resolve to data the
   * caller has already discarded.
   */
  readonly signal?: AbortSignal
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
