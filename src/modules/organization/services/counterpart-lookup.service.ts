import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type { CounterpartOption, CounterpartPage, paths } from '@/shared/types/generated/eiams-v1'
import type {
  CounterpartReference,
  SearchCounterpartsQuery,
} from '@/modules/organization/types/counterpart-lookup.types'

const COUNTERPARTS_PATH = '/counterparts' satisfies keyof paths
const COUNTERPART_PATH = '/counterparts/{type}/{counterpartId}' satisfies keyof paths

function counterpartPath(reference: CounterpartReference): string {
  return COUNTERPART_PATH.replace('{type}', encodeURIComponent(reference.type)).replace(
    '{counterpartId}',
    encodeURIComponent(reference.id),
  )
}

export interface CounterpartLookupService {
  /** Searches active options only; effective scope is enforced by the server. */
  searchCounterparts: (query: SearchCounterpartsQuery) => Promise<CounterpartPage>
  /** Resolves an active or inactive reference for immutable historical reads. */
  resolveCounterpart: (reference: CounterpartReference) => Promise<CounterpartOption>
}

export function createCounterpartLookupService(client: AxiosInstance): CounterpartLookupService {
  return {
    async searchCounterparts(query) {
      const response = await client.get<CounterpartPage>(COUNTERPARTS_PATH, { params: query })
      return response.data
    },
    async resolveCounterpart(reference) {
      const response = await client.get<CounterpartOption>(counterpartPath(reference))
      return response.data
    },
  }
}

export const counterpartLookupService = createCounterpartLookupService(apiClient)
