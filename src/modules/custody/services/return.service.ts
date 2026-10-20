import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'

const RETURN_ELIGIBLE_ITEMS_PATH = '/returns/eligible-items'

/**
 * Contract-shaped Return transport (return-workflow-frontend-fixes): the
 * server-authoritative eligible-items lookup for the Return draft form. The
 * backend owns which subjects of a posted Issue are still returnable to the
 * document's warehouse; the frontend never invents an eligible row.
 */
export interface ReturnService {
  /**
   * Lists the returnable allocations of a posted Issue document. One-based
   * paging (clamped into the backend's `[1, 100]` pageSize range); errors:
   * `OriginalIssueInvalid`, `Returns.Unauthorized`, 400 when the id is missing.
   */
  listEligibleItems: (
    originalIssueDocumentId: string,
    page?: number,
    pageSize?: number,
  ) => Promise<ApiPage<ReturnEligibleItem>>
}

export function createReturnService(transport: ApiTransport): ReturnService {
  return {
    async listEligibleItems(originalIssueDocumentId, page = 1, pageSize = 100) {
      return transport.requestPage<ReturnEligibleItem>({
        path: RETURN_ELIGIBLE_ITEMS_PATH,
        method: 'GET',
        query: {
          originalIssueDocumentId,
          ...toWireOneBasedPaginationParams({ page, pageSize }),
        },
      })
    },
  }
}

export const returnService = createReturnService(apiTransport)
