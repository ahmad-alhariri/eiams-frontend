import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'

import type {
  AssignAssetCustodyRequest,
  Custody,
  CustodyAssignmentCreated,
  ListCustodiesQuery,
  ListPendingCustodiesQuery,
  PendingCustody,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'
import { pathWithId } from '@/shared/services/api-path'

const CUSTODIES_PATH = '/custodies'
const CUSTODIES_PENDING_PATH = '/custodies/pending'
const CUSTODY_ASSIGN_PATH = '/assets/{assetId}/custody-assignment'
const CUSTODY_TRANSFER_PATH = '/custodies/{custodyId}/transfer'

/**
 * Sends a list query through the ONE shared pagination clamp.
 *
 * `page` is ONE-based on both sides (`useServerPagination` and the wire
 * `PaginationQueryParameters.Page` is `Range(1, 21474836)`), so the helper
 * only clamps it. The previous `pageIndex` was forwarded verbatim, which put
 * `pageIndex=0` on the wire — a parameter the server does not bind, so every
 * custody list stayed on its first page.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): Record<string, string | number | boolean | undefined> {
  const { page, pageSize, ...filters } = query
  return {
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  }
}

/**
 * Custody transport: the scoped list, the warehouse-scoped pending list, and
 * the two mutations.
 *
 * `assignCustody` lives at `POST /assets/{assetId}/custody-assignment` in the
 * live API — the asset id is in the path, not the body.
 *
 * `transferCustody` stays at `POST /custodies/{custodyId}/transfer`; its live
 * request body (`TransferCustodyRequest`) differs from the assign body and is
 * its own handwritten type. The live controller answers 200 with an empty
 * payload, so the mutation carries no result.
 *
 * The assign controller does NOT accept an `Idempotency-Key` header - verified
 * against `src/Web.Api/Controllers/Custodies/AssignAssetCustodyController.cs`;
 * the transfer controller does not declare one either. No header is forwarded
 * for either call.
 */
export interface CustodyService {
  listCustodies: (query: ListCustodiesQuery) => Promise<ApiPage<Custody>>
  listPendingCustodies: (query: ListPendingCustodiesQuery) => Promise<ApiPage<PendingCustody>>
  assignCustody: (
    assetId: string,
    request: AssignAssetCustodyRequest,
  ) => Promise<CustodyAssignmentCreated>
  transferCustody: (custodyId: string, request: TransferCustodyRequest) => Promise<void>
}

export function createCustodyService(transport: ApiTransport): CustodyService {
  return {
    async listCustodies(query) {
      return transport.requestPage<Custody>({
        path: CUSTODIES_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },
    async listPendingCustodies(query) {
      return transport.requestPage<PendingCustody>({
        path: CUSTODIES_PENDING_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },
    async assignCustody(assetId, request) {
      return transport.request<CustodyAssignmentCreated>({
        path: pathWithId(CUSTODY_ASSIGN_PATH, '{assetId}', assetId),
        method: 'POST',
        body: request,
      })
    },
    async transferCustody(custodyId, request) {
      await transport.requestEmpty({
        path: pathWithId(CUSTODY_TRANSFER_PATH, '{custodyId}', custodyId),
        method: 'POST',
        body: request,
      })
    },
  }
}

export const custodyService = createCustodyService(apiTransport)
