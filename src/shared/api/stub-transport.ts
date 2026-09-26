/** Stub ApiTransport for use in tests and dev tooling when the real backend is
 *  unavailable. Returns synthetic success responses so callers can verify their
 *  query shapes, invalidation, and UI branches without hitting the network.
 *
 *  Replaces the generated `ApiClient` in non-production contexts only. Shared
 *  with `docs/direct-backend-integration-plan.md` §4.2 (transport seam).
 *
 *  Post-vi65.3.5: stub meta uses canonical camelCase (`requestId`, `timestampUtc`).
 */

import type { ApiSuccessResponse, ApiPage } from './api-contracts'
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
    async request<TResponse>(
      request: Readonly<ApiRequest>,
    ): Promise<ApiSuccessResponse<TResponse>> {
      // Return an empty success envelope; tests supply MSW intercepts before
      // real assertions run, so this stub is a fallback only.
      // Use request to avoid unused param lint
      void request
      return {
        success: true,
        data: null as unknown as TResponse,
        pagination: null,
        meta: { requestId: 'stub-' + Date.now(), timestampUtc: new Date().toISOString() },
      }
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
