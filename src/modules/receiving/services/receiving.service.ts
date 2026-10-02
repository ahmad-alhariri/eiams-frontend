import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { paths } from '@/shared/types/generated/eiams-v1'

const RECEIVING_SUPPLIERS_PATH = '/receiving/suppliers' satisfies keyof paths

export interface ReceivingService {
  /**
   * Distinct supplier-reference suggestions (contract: `string[]`).
   * `search` is the contract-required query parameter; the caller owns
   * debouncing and minimum query length.
   */
  searchReceivingSuppliers: (search: string) => Promise<readonly string[]>
}

/**
 * Contract-only receiving transport. Draft persistence (create/update of a
 * `WarehouseDocumentDraftRequest`) is deliberately NOT duplicated here — the
 * shared document engine already owns those spine operations
 * (`documentService.createDocument` / `updateDocument`); this service adds
 * only the receiving-owned supplier-suggestion operation.
 */
export function createReceivingService(transport: ApiTransport): ReceivingService {
  return {
    async searchReceivingSuppliers(search) {
      const response = await transport.request<readonly string[]>({
        path: RECEIVING_SUPPLIERS_PATH,
        method: 'GET',
        query: { search },
      })
      return response.data
    },
  }
}

export const receivingService = createReceivingService(apiTransport)
