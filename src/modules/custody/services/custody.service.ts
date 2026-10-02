import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  CustodyMutationRequest,
  ListCustodiesQuery,
} from '@/modules/custody/types/custody.types'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import type { Custody, CustodyPage, paths } from '@/shared/types/generated/eiams-v1'

const CUSTODIES_PATH = '/custodies' satisfies keyof paths
const CUSTODY_ASSIGN_PATH = '/custodies/assign' satisfies keyof paths
const CUSTODY_TRANSFER_PATH = '/custodies/{custodyId}/transfer' satisfies keyof paths

function pathWithId(path: string, placeholder: string, value: string): string {
  return path.replace(placeholder, encodeURIComponent(value))
}

/** Contract-shaped custody transport (e19-t01). Read-only list plus the two idempotent mutations. */
export interface CustodyService {
  listCustodies: (query: ListCustodiesQuery) => Promise<CustodyPage>
  assignCustody: (request: CustodyMutationRequest, idempotencyKey: string) => Promise<Custody>
  transferCustody: (
    custodyId: string,
    request: CustodyMutationRequest,
    idempotencyKey: string,
  ) => Promise<Custody>
}

export function createCustodyService(transport: ApiTransport): CustodyService {
  return {
    async listCustodies(query) {
      const page = await transport.requestPage<Custody>({
        path: CUSTODIES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return {
        items: page.items,
        meta: {
          pageIndex: page.page - 1,
          page: page.page,
          pageSize: page.pageSize,
          itemCount: page.totalItems,
          totalItems: page.totalItems,
          totalCount: page.totalItems,
          totalPages: page.totalPages,
          hasNextPage: page.hasNextPage,
          hasPreviousPage: page.hasPreviousPage,
        },
      } as CustodyPage
    },
    async assignCustody(request, idempotencyKey) {
      const response = await transport.request<Custody>({
        path: CUSTODY_ASSIGN_PATH,
        method: 'POST',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response.data
    },
    async transferCustody(custodyId, request, idempotencyKey) {
      const response = await transport.request<Custody>({
        path: pathWithId(CUSTODY_TRANSFER_PATH, '{custodyId}', custodyId),
        method: 'POST',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      })
      return response.data
    },
  }
}

export const custodyService = createCustodyService(apiTransport)
