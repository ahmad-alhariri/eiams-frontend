import { useCallback } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { organizationQueryKeys } from '@/modules/organization/hooks/use-organization-queries'
import { organizationService } from '@/modules/organization/services/organization.service'
import type { ListSitesQuery } from '@/modules/organization/types/organization.api-types'
import { warehouseQueryKeys } from '@/modules/warehouse/hooks/use-warehouse-queries'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type { ListWarehousesQuery } from '@/modules/warehouse/types/warehouse.api-types'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type { RoleScopeType } from '@/modules/admin/types/role.types'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type OptionLoader,
} from '@/shared/selectors/selector-adapter'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'

const DEFAULT_MAX_RESULTS = 10

/**
 * Narrows a raw scope record to the fields the picker consumes.
 *
 * Reads the wire names (`id`, `name`) and falls back to the generated names only so
 * the picker still renders under the fixtures that use them. Anything missing yields
 * an empty label rather than the literal string "undefined".
 */
function toScopeTarget(raw: Record<string, unknown>): ScopeTarget {
  const read = (...keys: readonly string[]): string => {
    for (const key of keys) {
      const value = raw[key]
      if (typeof value === 'string' && value.trim() !== '') return value
    }
    return ''
  }
  return {
    id: read('id', 'siteId', 'warehouseId'),
    name: read('name', 'nameAr'),
    code: read('code'),
  }
}

/**
 * A scope target, exactly as the Site and Warehouse reads serve it.
 *
 * Deliberately NOT the generated `Site` / `Warehouse`. Those describe records the
 * backend does not return: they name the identifier `siteId` / `warehouseId` and the
 * label `nameAr`, while the live projections are `id` and `name` (verified against
 * the running API: `Application.Sites.GetList.SiteResponse` is
 * `{id, organizationId, name, code, location, governorateCode, status}` and
 * `Application.Warehouses.GetList.WarehouseResponse` adds `siteId`, `warehouseType`,
 * `canHoldStock` and `rowVersion`). Reading the generated fields produced
 * `value: undefined` and a literal "undefined (DMS)" label.
 *
 * Only the three fields the picker needs are declared, so the gap is scoped to what
 * this surface actually consumes.
 */
export interface ScopeTarget {
  readonly id: string
  readonly name: string
  readonly code: string
}

const siteAdapter = createEntitySelectorAdapter<ScopeTarget>({
  toOption: (site) => ({
    value: site.id,
    label: `${site.name} (${site.code})`,
    payload: site,
  }),
  searchLabel: (site) => `${site.name} ${site.code}`,
})

const warehouseAdapter = createEntitySelectorAdapter<ScopeTarget>({
  toOption: (warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.name} (${warehouse.code})`,
    payload: warehouse,
  }),
  searchLabel: (warehouse) => `${warehouse.name} ${warehouse.code}`,
})

/**
 * Arabic async selector options for the scope half of a user assignment.
 *
 * D-SRS-01 requires an accessible asynchronous selector here rather than a raw
 * UUID field: an administrator choosing a warehouse must recognise it by name,
 * and the server exposes only the scopes that administrator may see.
 *
 * Enterprise has no target resource, so it resolves to an empty option list and
 * the editor hides the selector entirely.
 */
export interface AssignmentScopeSelector {
  /** AsyncSelect-compatible loader for the given scope type. */
  loadOptions: OptionLoader<ScopeTarget>
  /** False until an active scope is known, so the selector stays disabled. */
  scopeReady: boolean
}

/**
 * Binds the scope picker to the server-authoritative Site and Warehouse reads.
 *
 * Both reads go through `fetchQuery` with their own module query keys so the
 * panel shares the cached pages the rest of the application already uses, rather
 * than duplicating master data under an admin-specific key.
 */
export function useAssignmentScopeSelector(
  scopeType: RoleScopeType,
  maxResults = DEFAULT_MAX_RESULTS,
): AssignmentScopeSelector {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const queryClient = useQueryClient()
  const scopeReady = scope !== undefined && scopeType !== 'Enterprise'

  const loadEntities = useCallback<EntityLoader<ScopeTarget>>(
    async (search) => {
      if (scope === undefined || scopeType === 'Enterprise') {
        return []
      }

      const trimmedSearch = search.trim()
      const pageSize = Math.max(1, maxResults)

      if (scopeType === 'Site') {
        const query: ListSitesQuery = {
          page: 1,
          pageSize,
          ...(trimmedSearch === '' ? {} : { search: trimmedSearch }),
        }
        const page = await queryClient.fetchQuery({
          queryKey: organizationQueryKeys.sites(scope, query),
          queryFn: () => organizationService.listSites(query),
          staleTime: MASTER_DATA_STALE_TIME,
        })
        // CONFINED KNOWN DIVERGENCE: `organizationService.listSites` is typed against
        // the generated `Site`, which names the fields `siteId` / `nameAr` while the
        // live projection serves `id` / `name`. This read is narrowed to the three
        // fields the picker needs rather than force-cast to the generated type, which
        // would let `undefined` reach the UI exactly as before. Migrating the whole
        // Site/Warehouse surface is filed separately.
        return page.items.map((site) => toScopeTarget(site as unknown as Record<string, unknown>))
      }

      const query: ListWarehousesQuery = {
        page: 1,
        pageSize,
        ...(trimmedSearch === '' ? {} : { search: trimmedSearch }),
      }
      const page = await queryClient.fetchQuery({
        queryKey: warehouseQueryKeys.warehouses(scope, query),
        queryFn: () => warehouseService.listWarehouses(query),
        staleTime: MASTER_DATA_STALE_TIME,
      })
      // Same confined divergence as the Site read above.
      return page.items.map((warehouse) =>
        toScopeTarget(warehouse as unknown as Record<string, unknown>),
      )
    },
    [maxResults, queryClient, scope, scopeType],
  )

  const adapter = scopeType === 'Site' ? siteAdapter : warehouseAdapter
  const loadOptions = useScopedEntityOptions(adapter, loadEntities, maxResults)

  return { loadOptions, scopeReady }
}

/**
 * Arabic label for a single served scope target, read by id.
 *
 * The assignment projection carries a scope UUID and nothing else, so an
 * administrator has to be shown a name for it. This resolves that through the
 * existing single-resource reads, which are already cached under their own module
 * keys, and returns `undefined` when the read fails or the caller lacks
 * `sites.view` / `warehouses.view` — the caller then shows the formatted
 * identifier rather than inventing a name.
 */
export function useAssignmentScopeLabel(
  scopeType: RoleScopeType,
  scopeId: string | null,
): string | undefined {
  const scope = useActiveScopeContext().activeScopeCacheKey

  return useQuery({
    queryKey:
      scope === undefined || scopeId === null
        ? queryKeys.public('admin', 'assignment-scope-label', scopeType, scopeId)
        : scopeType === 'Site'
          ? organizationQueryKeys.site(scope, scopeId)
          : warehouseQueryKeys.warehouse(scope, scopeId),
    queryFn: async () => {
      const record =
        scopeType === 'Site'
          ? await organizationService.getSite(scopeId ?? '')
          : await warehouseService.getWarehouse(scopeId ?? '')
      // Read through the same narrowing as the list reads: the single-resource
      // projection serves `name`, not the generated `nameAr`. Returning
      // `record.nameAr` made this query resolve to `undefined`, which React Query
      // reports as an error even though the HTTP call succeeded — and the label fell
      // back to the raw identifier.
      return toScopeTarget(record as unknown as Record<string, unknown>).name
    },
    enabled: scope !== undefined && scopeId !== null && scopeType !== 'Enterprise',
    staleTime: MASTER_DATA_STALE_TIME,
  }).data
}
