/**
 * Stub ApiTransport for use in tests and dev tooling when the real backend is
 * unavailable. Returns synthetic success responses so callers can verify their
 * query shapes, invalidation, and UI branches without hitting the network.
 *
 * Replaces the generated `ApiClient` in non-production contexts only. Shared
 * with `docs/direct-backend-integration-plan.md` §4.2 (transport seam).
 */

import type { ApiPage } from './api-contracts'
import type { ApiRequest } from './api-transport'

function toPage<T>(items: ReadonlyArray<T>, page = 1, pageSize = 50) {
  return {
    items,
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    hasPreviousPage: page > 1,
    hasNextPage: items.length >= pageSize,
  } as ApiPage<T>
}

export function createStubTransport(): import('./api-transport').ApiTransport {
  return {
    async request<TResponse>(request: Readonly<ApiRequest>): Promise<TResponse> {
      // Return a null payload; tests supply MSW intercepts before real
      // assertions run, so this stub is a fallback only.
      //
      // It resolves to the PAYLOAD to match `ApiTransport`. It used to build a
      // whole success envelope here, which meant this stub and
      // `createAxiosTransport` disagreed about what `request` resolves to — and
      // since services are typed against the interface, a test running on the
      // stub and a test running through Axios were exercising two different
      // contracts. That is the same split this signature change exists to close.
      //
      // Use request to avoid unused param lint
      void request
      return null as unknown as TResponse
    },

    async requestPage<TItem>(request: Readonly<ApiRequest>): Promise<ApiPage<TItem>> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: readonly TItem[] = (request.body as any) ?? []
      return toPage(items)
    },

    async requestEmpty(request: Readonly<ApiRequest>): Promise<void> {
      // no-op
      void request
    },
  }
}
