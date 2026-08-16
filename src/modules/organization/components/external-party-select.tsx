import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationQueryKeys } from '@/modules/organization/hooks/use-organization-queries'
import { organizationService } from '@/modules/organization/services/organization.service'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import type { ExternalParty } from '@/shared/types/generated/eiams-v1'

export interface ExternalPartySelectProps {
  value?: string | null
  onValueChange: (value: string | null, party: ExternalParty | undefined) => void
  disabled?: boolean
  readOnly?: boolean
}

/** Active-only lookup page used by write selectors. */
const LOOKUP_PAGE = { pageIndex: 0, pageSize: 10, status: 'Active' } as const

/**
 * Document-safe counterpart selector. It requests Active records only and
 * intentionally exposes no creation action; reference-data administration is
 * kept on its controlled organization screen.
 *
 * Results are TanStack Query-owned (scoped cache keys, master-data staleness)
 * while AsyncSelect keeps its debounced, request-per-search interaction model.
 */
export function ExternalPartySelect({
  value,
  onValueChange,
  disabled = false,
  readOnly = false,
}: ExternalPartySelectProps) {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext().activeScopeCacheKey

  const loadOptions = useCallback(
    async (search: string): Promise<AsyncSelectOption<ExternalParty>[]> => {
      if (scope === undefined) {
        return []
      }

      const query = { ...LOOKUP_PAGE, ...(search === '' ? {} : { search }) }
      const page = await queryClient.fetchQuery({
        queryKey: organizationQueryKeys.externalParties(scope, query),
        queryFn: () => organizationService.listExternalParties(query),
        staleTime: MASTER_DATA_STALE_TIME,
      })

      return page.items.map((party) => ({
        value: party.externalPartyId,
        label: party.code ? `${party.nameAr} — ${party.code}` : party.nameAr,
        payload: party,
      }))
    },
    [queryClient, scope],
  )

  return (
    <AsyncSelect
      {...(value === undefined ? {} : { value })}
      onValueChange={(nextValue, option) => onValueChange(nextValue, option?.payload)}
      loadOptions={loadOptions}
      disabled={disabled}
      readOnly={readOnly}
      placeholder="ابحث عن جهة خارجية..."
    />
  )
}
