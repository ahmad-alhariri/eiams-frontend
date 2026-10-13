import { delay, http, type HttpHandler } from 'msw'

import { okJson } from './envelope'

import { environment } from '@/config/env'
import { fixtureUuid } from '@/test/msw/factories'

const RECEIVING_SUPPLIERS_PREFIX = `${environment.apiBaseUrl}/receiving-infos/suppliers`

export interface ReceivingSuppliersHandlerOptions {
  /** Simulated network latency; defaults to 0 so suites stay fast. */
  delayMs?: number
}

/**
 * GET /receiving-infos/suppliers — distinct supplier-reference suggestions for
 * the receiving petal. The contract requires a `search` parameter; the handler
 * filters the seeded suggestions with a case-insensitive substring match and
 * caps the response at the same 10 items the UI's AsyncSelect displays.
 *
 * Each row is the LIVE `SupplierSuggestionResponse` — `{ id, nameAr, code }` —
 * because `id` is the external-party id the draft write binds as
 * `SupplierPartyId`. The snapshot's bare `string[]` was invented: a name alone
 * cannot bind server-side, which is exactly why the petal has no free-text
 * create row. Callers still pass Arabic names; ids are minted deterministically
 * from the seed position so a test can assert a stable submitted id.
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
      return okJson(
        matches.slice(0, 10).map((nameAr) => ({
          id: fixtureUuid(600 + distinct.indexOf(nameAr)),
          nameAr,
          code: null,
        })),
      )
    }),
  ]
}
