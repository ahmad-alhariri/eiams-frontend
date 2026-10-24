import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

const RECEIVING_SUPPLIERS_PATH = '/receiving-infos/suppliers'

/**
 * `Application.ReceivingInfos.SupplierSuggestionResponse` — the live supplier
 * picker row. The V1 draft binds the supplier NAME, so the row carries only
 * `name`; the combobox commits it as text and the server stores it as
 * `supplier_ref`.
 */
export interface SupplierSuggestion {
  readonly name: string
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
