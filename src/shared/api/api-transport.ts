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

/**
 * The per-call context a service read may accept, so a caller can cancel it.
 *
 * WHY THIS EXISTS RATHER THAN A SIGNAL ON EVERY METHOD SIGNATURE. TanStack Query
 * hands every `queryFn` an `AbortSignal` that is aborted the moment the query is
 * cancelled or its observer unmounts. Nothing in this repository could accept
 * one: `ApiRequest` had no `signal`, so the signal every query was already
 * generating was discarded at the `queryFn` boundary. Reads therefore kept
 * running after the component that wanted them was gone.
 *
 * It is a context OBJECT rather than a bare second `signal` parameter so that
 * `exactOptionalPropertyTypes` accepts an absent context from the ~50 existing
 * call sites and test invocations that pass only the query. Widening those to
 * `(query, signal)` would have forced an edit at every one of them for no
 * behavioural gain, and a mechanical ripple across every module is the failure
 * mode this seam exists to avoid.
 *
 * MUTATIONS DELIBERATELY DO NOT TAKE ONE. A half-applied document post is worse
 * than a wasted request, so a mutation must not be cancelable by a caller that
 * no longer wants to wait for it. Only reads are cancellable.
 */
export interface RequestContext {
  readonly signal?: AbortSignal
}

/**
 * Projects a context onto the `signal` key of an `ApiRequest`.
 *
 * Needed because `exactOptionalPropertyTypes` forbids assigning `undefined` to
 * an optional property, so `signal: context?.signal` does not compile and the
 * service cannot simply spell the field out at each call site.
 */
export function withSignal(context?: RequestContext): { readonly signal?: AbortSignal } {
  return context?.signal === undefined ? {} : { signal: context.signal }
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
