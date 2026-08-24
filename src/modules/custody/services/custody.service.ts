import type { AxiosInstance } from 'axios'

import type {
  CustodyMutationRequest,
  ListCustodiesQuery,
} from '@/modules/custody/types/custody.types'
import { apiClient } from '@/shared/services/api.client'
import { withIdempotencyKey } from '@/shared/services/mutation-safety'
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

export function createCustodyService(client: AxiosInstance): CustodyService {
  return {
    async listCustodies(query) {
      const response = await client.get(CUSTODIES_PATH, { params: query })
      return response.data
    },
    async assignCustody(request, idempotencyKey) {
      const response = await client.post(
        CUSTODY_ASSIGN_PATH,
        request,
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },
    async transferCustody(custodyId, request, idempotencyKey) {
      const response = await client.post(
        pathWithId(CUSTODY_TRANSFER_PATH, '{custodyId}', custodyId),
        request,
        withIdempotencyKey(idempotencyKey).config,
      )
      return response.data
    },
  }
}

export const custodyService = createCustodyService(apiClient)
