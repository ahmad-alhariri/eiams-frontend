import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

const RECEIVING_SUPPLIERS_PATH = '/receiving-infos/suppliers'

/**
 * `Application.ReceivingInfos.SupplierSuggestionResponse` — the live supplier
 * picker row. `id` is the external-party id the draft write binds as
 * `SupplierPartyId`; the snapshot's `string[]` suggestion shape was invented.
 */
export interface SupplierSuggestion {
  readonly id: string
  readonly nameAr: string
  readonly code: string | null
}

export interface ReceivingService {
  /**
   * Supplier suggestions for the receiving petal. `search` is the route's query
   * parameter; the caller owns debouncing and the minimum query length.
   */
  searchReceivingSuppliers: (search: string) => Promise<readonly SupplierSuggestion[]>
}

/**
 * Contract-only receiving transport. Draft persistence is deliberately NOT
 * duplicated here — the shared document engine owns the `complete-draft` write;
 * this service adds only the receiving-owned supplier-suggestion read.
 */
export function createReceivingService(transport: ApiTransport): ReceivingService {
  return {
    async searchReceivingSuppliers(search) {
      const response = await transport.request<readonly SupplierSuggestion[]>({
        path: RECEIVING_SUPPLIERS_PATH,
        method: 'GET',
        query: { search },
      })
      return response
    },
  }
}

export const receivingService = createReceivingService(apiTransport)