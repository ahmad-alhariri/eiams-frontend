import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  CounterpartOperation,
  CounterpartReference,
  CounterpartResolution,
  CounterpartType,
  SearchCounterpartsQuery,
} from '@/modules/organization/types/counterpart-lookup.types'

/**
 * Backend polymorphic-counterpart routes (live API source of truth).
 *
 *  - `GET /counterparts`              → CounterpartLookupService.searchCounterparts
 *  - `GET /counterparts/{type}/{id}`  → CounterpartLookupService.resolveCounterpart
 *
 * Replaces the previous `CounterpartLookupService` shape, which targeted
 * `/external-parties` for a record the backend does not serve on that route
 * (the `/external-parties` controller serves the admin ExternalParty CRUD
 * aggregate, not the polymorphic counterpart write-flow read). The previous
 * call returned zero usable options because the wire produced an
 * `ExternalParty` and the consuming UI expected a `CounterpartResolution`.
 */
const COUNTERPARTS_PATH = '/counterparts'

export type { CounterpartReference }

export interface CounterpartLookupService {
  /** `GET /counterparts` — `operation` REQUIRED, `type` validator-restricted. */
  searchCounterparts: (
    query: Omit<SearchCounterpartsQuery, 'page' | 'pageSize'> & { pageSize?: number },
  ) => Promise<readonly CounterpartResolution[]>
  /** `GET /counterparts/{type}/{counterpartId}` */
  resolveCounterpart: (reference: CounterpartReference | string) => Promise<CounterpartResolution>
}

export function createCounterpartLookupService(transport: ApiTransport): CounterpartLookupService {
  return {
    async searchCounterparts({
      search,
      operation,
      type,
      pageSize,
    }: {
      search?: string
      operation: CounterpartOperation
      type?: CounterpartType
      pageSize?: number
    }) {
      // The backend handler accepts the `page` parameter through its
      // `PaginationQueryParameters` binding; we send `page: 1` (one-based per
      // D-INT-02) and rely on the server-side `SearchActiveAsync` to filter
      // to Active records. The handler filters out inactive counterparts
      // server-side (the result items will never carry `status: 'Inactive'`).
      const result = await transport.requestPage<CounterpartResolution>({
        path: COUNTERPARTS_PATH,
        method: 'GET',
        // No `as Record<...>` on this literal. The cast is exactly what let a
        // wrong pagination key reach the wire unnoticed in the sibling
        // `organization.service.ts` (`pageIndex: 0`, a key
        // `ListExternalPartiesQuery` does not even declare), and an object
        // literal types fine against the query index signature without it.
        query: {
          ...(search !== undefined && search !== '' ? { search } : {}),
          operation,
          ...(type !== undefined ? { type } : {}),
          page: 1,
          pageSize: pageSize ?? 10,
        },
      })
      return result.items
    },

    async resolveCounterpart(reference) {
      // `reference` may be a bare string (a previous call site) or the
      // structured `{type, id}` form. The bare-string form was the legacy
      // `ExternalParty` lookup which we no longer support — callers should
      // pass `{type, id}` from the resolution result of `searchCounterparts`.
      if (typeof reference === 'string') {
        throw new Error(
          'resolveCounterpart requires a structured CounterpartReference {type, id}; bare-id resolution was retired when the route moved to /counterparts/{type}/{counterpartId}.',
        )
      }
      const response = await transport.request<CounterpartResolution>({
        path: `${COUNTERPARTS_PATH}/${encodeURIComponent(reference.type)}/${encodeURIComponent(reference.id)}`,
        method: 'GET',
      })
      return response
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Never `{} as
// any` — that default is what made the first runtime list call throw. Replaced
// during tests by `setCounterpartLookupService`.
let counterpartLookupService: CounterpartLookupService =
  createCounterpartLookupService(apiTransport)

export function setCounterpartLookupService(transport: ApiTransport) {
  counterpartLookupService = createCounterpartLookupService(transport)
}

export { counterpartLookupService }
