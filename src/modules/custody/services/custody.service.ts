import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type {
  AssignAssetCustodyRequest,
  CustodyAssignmentCreated,
  ListCustodiesQuery,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'
import type { Custody, CustodyPage, paths } from '@/shared/types/generated/eiams-v1'

const CUSTODIES_PATH = '/custodies' satisfies keyof paths
const CUSTODY_ASSIGN_PATH = '/assets/{assetId}/custody-assignment'
const CUSTODY_TRANSFER_PATH = '/custodies/{custodyId}/transfer' satisfies keyof paths

function pathWithId(path: string, placeholder: string, value: string): string {
  return path.replace(placeholder, encodeURIComponent(value))
}

/**
 * Contract-shaped custody transport (e19-t01). Read-only list plus the two
 * idempotent mutations.
 *
 * `assignCustody` lives at `POST /assets/{assetId}/custody-assignment` in the
 * live API (verified 2026-10-20). The previous `POST /custodies/assign` does
 * not exist; the snapshot shape `CustodyMutationRequest` is not what the live
 * controller accepts (the asset id is in the path, not the body).
 *
 * `transferCustody` stays at `POST /custodies/{custodyId}/transfer`; its live
 * request body (`TransferCustodyRequest`) differs from the assign body and is
 * its own handwritten type.
 *
 * The assign controller does NOT accept an `Idempotency-Key` header — verified
 * against `src/Web.Api/Controllers/Custodies/AssignAssetCustodyController.cs` on
 * 2026-10-20; the transfer controller does not declare one either. No header
 * is forwarded for either call.
 */
export interface CustodyService {
  listCustodies: (query: ListCustodiesQuery) => Promise<CustodyPage>
  assignCustody: (
    assetId: string,
    request: AssignAssetCustodyRequest,
  ) => Promise<CustodyAssignmentCreated>
  transferCustody: (
    custodyId: string,
    request: TransferCustodyRequest,
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
    async assignCustody(assetId, request) {
      const response = await transport.request<CustodyAssignmentCreated>({
        path: pathWithId(CUSTODY_ASSIGN_PATH, '{assetId}', assetId),
        method: 'POST',
        body: request,
      })
      return response
    },
    async transferCustody(custodyId, request) {
      const response = await transport.request<Custody>({
        path: pathWithId(CUSTODY_TRANSFER_PATH, '{custodyId}', custodyId),
        method: 'POST',
        body: request,
      })
      return response
    },
  }
}

export const custodyService = createCustodyService(apiTransport)
