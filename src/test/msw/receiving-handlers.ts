import { delay, http, type HttpHandler } from 'msw'

import { okJson } from './envelope'

import { environment } from '@/config/env'

const RECEIVING_SUPPLIERS_PREFIX = `${environment.apiBaseUrl}/receiving-infos/suppliers`

export interface ReceivingSuppliersHandlerOptions {
  /** Simulated network latency; defaults to 0 so suites stay fast. */
  delayMs?: number
}

/**
 * GET /receiving-infos/suppliers — distinct supplier-name suggestions for the
 * receiving petal. The contract requires a `search` parameter; the handler
 * filters the seeded suggestions with a case-insensitive substring match and
 * caps the response at the same 10 items the UI's AsyncSelect displays.
 *
 * Each row is the LIVE `SupplierSuggestionResponse` — `{ name }` ONLY. The V1
 * draft binds the supplier NAME as free text, so there is no id/code to mint.
 */
export function createReceivingSuppliersHandler(
  suppliers: readonly string[],
  options: ReceivingSuppliersHandlerOptions = {},
): readonly HttpHandler[] {
  const distinct = [...new Set(suppliers.filter((item) => item.trim().length > 0))]
  return [
    http.get(RECEIVING_SUPPLIERS_PREFIX, async ({ request }) => {
      await delay(options.delayMs ?? 0)
      const url = new URL(request.url)
      const search = url.searchParams.get('search') ?? ''
      const normalized = search.trim().toLocaleLowerCase('ar')
      const matches =
        normalized.length === 0
          ? distinct
          : distinct.filter((item) => item.toLocaleLowerCase('ar').includes(normalized))
      // Serves the wire envelope: `data` is the suggestion array. A bare array here
      // meant the transport read `.data` off undefined and returned nothing.
      return okJson(matches.slice(0, 10).map((name) => ({ name })))
    }),
  ]
}
