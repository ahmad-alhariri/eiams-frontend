import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import type { ApiTransport } from '@/shared/api/api-transport'

const EXTERNAL_PARTIES_PATH = '/external-parties'

export type CounterpartReference = { readonly type: 'ExternalParty'; readonly id: string }

export interface CounterpartLookupService {
  searchCounterparts: (query: {
    search?: string
    status?: 'Active' | 'Inactive'
  }) => Promise<readonly ExternalParty[]>
  resolveCounterpart: (reference: CounterpartReference | string) => Promise<ExternalParty>
}

export function createCounterpartLookupService(transport: ApiTransport): CounterpartLookupService {
  return {
    async searchCounterparts({
      search,
      status,
    }: {
      search?: string
      status?: 'Active' | 'Inactive'
    }) {
      const result = await transport.requestPage<ExternalParty>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'GET',
        query: {
          ...(search !== undefined ? { search } : {}),
          ...(status !== undefined ? { status } : {}),
          pageSize: 100,
        } as Record<string, string | number | boolean | undefined>,
      })
      return result.items
    },

    async resolveCounterpart(reference) {
      const id = typeof reference === 'string' ? reference : reference.id
      const response = await transport.request<ExternalParty>({
        path: `${EXTERNAL_PARTIES_PATH}/${encodeURIComponent(id)}`,
        method: 'GET',
      })
      return response.data
    },
  }
}

// Lazy singleton — replaced during tests by `setCounterpartLookupService`.
let counterpartLookupService: CounterpartLookupService = createCounterpartLookupService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function setCounterpartLookupService(transport: ApiTransport) {
  counterpartLookupService = createCounterpartLookupService(transport)
}

export { counterpartLookupService }
