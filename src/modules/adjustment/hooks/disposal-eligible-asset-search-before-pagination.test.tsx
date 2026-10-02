import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { renderHook } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { Asset } from '@/shared/types/generated/eiams-v1'
import { createAsset, createNamedReference, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDisposalEligibleAssetSelector } from './use-disposal-eligible-asset-selector'

/**
 * D-ADJ-01: the disposal lookup filters, THEN pages.
 *
 * `GET /adjustments/disposal-eligible-assets` is server-authoritative — D-ADJ-01
 * forbids free-text asset identities — so the only way an operator can reach a
 * given asset is to type enough of its identity for the server to narrow the
 * candidate set. That makes the ORDER of the two server operations load-bearing:
 * filter-then-slice returns the match on the first page, slice-then-filter drops
 * it whenever it sits past the requested page size. The asset is not "hard to
 * find", it is unreachable, and no client-side change can recover it.
 *
 * This suite owns the requirement on the CLIENT half of the seam, which is the
 * half the frontend owns: the debounced search text, the selected warehouse, and
 * the first page must reach the wire on every lookup. A selector that silently
 * dropped `search` would look identical in every other test in the repository
 * while making the disposal form unusable in production.
 *
 * The endpoint is served by a LOCAL contract handler rather than by a fixture
 * from `src/mocks/`, deliberately and for two reasons. The behaviour has to
 * outlive the dev-mock layer (`eiams-frontend-m4jm` deletes it), and a handler
 * written here can take the ordering as a parameter, so the negative control at
 * the bottom can SHOW this suite's central assertion failing rather than merely
 * claiming it would.
 */

const ENDPOINT = '*/api/v1/adjustments/disposal-eligible-assets'

const TARGET_WAREHOUSE = createNamedReference({
  id: fixtureUuid(30),
  displayName: 'المستودع المركزي',
})
const OTHER_WAREHOUSE = createNamedReference({
  id: fixtureUuid(31),
  displayName: 'المستودع الثاني',
})

/** The asset under search: eligible, in the selected warehouse, and buried. */
const TARGET = createAsset({
  assetId: fixtureUuid(7000),
  assetNumber: 'AST-TARGET-9001',
  currentWarehouse: TARGET_WAREHOUSE,
  derivedStatus: 'InStock',
})

/**
 * 50 eligible assets that match nothing the operator types. They exist so the
 * target sits at index 50 of the unfiltered set: any page size at or below 50
 * hides it from an unfiltered first page, which is the condition the search
 * assertion below exists to make impossible to satisfy silently.
 */
const NON_MATCHING = Array.from({ length: 50 }, (_, index) =>
  createAsset({
    assetId: fixtureUuid(7100 + index),
    assetNumber: `BEFORE-${index.toString().padStart(3, '0')}`,
    currentWarehouse: TARGET_WAREHOUSE,
    derivedStatus: 'InStock',
  }),
)

const SEED = [...NON_MATCHING, TARGET]

/** One wire request, as the endpoint's contract sees it. */
interface EligibleAssetsRequest {
  readonly page: string | null
  readonly pageSize: string | null
  readonly search: string | null
  readonly warehouseId: string | null
}

/**
 * The `Search` parameter's own projection: asset number, manufacturer serial,
 * and material display name — the three strings an operator can plausibly type
 * off a physical label. Deliberately written from the contract's meaning rather
 * than copied from any server's implementation of it.
 */
function matchesSearch(asset: Asset, search: string | null): boolean {
  const needle = search?.trim() ?? ''
  if (needle === '') return true
  return `${asset.assetNumber} ${asset.serialNumber ?? ''} ${asset.material.displayName}`
    .toLowerCase()
    .includes(needle.toLowerCase())
}

type ApplyOrder = 'filter-then-slice' | 'slice-then-filter'

/**
 * Serves the endpoint from `assets` under an explicit ordering.
 *
 * `slice-then-filter` exists only for the negative control. It is the realistic
 * wrong implementation — what you get when a paging helper runs before a filter
 * helper and nobody decided which order was meant — and it returns a page that
 * is well-formed in every respect except that the operator's match is absent.
 */
function serveEligibleAssets(
  assets: readonly Asset[],
  seen: EligibleAssetsRequest[],
  order: ApplyOrder = 'filter-then-slice',
) {
  server.use(
    http.get(ENDPOINT, ({ request }) => {
      const params = new URL(request.url).searchParams
      const page = params.get('page')
      const pageSize = params.get('pageSize')
      const warehouseId = params.get('warehouseId')
      const search = params.get('search')
      seen.push({ page, pageSize, search, warehouseId })

      // One-based on the wire (`PaginationQueryParameters.Page`), zero-based for
      // slicing — the same conversion the shared pagination boundary owns.
      const pageIndex = Math.max(1, Number(page ?? '1')) - 1
      const size = Math.max(1, Number(pageSize ?? '20'))

      const isEligible = (asset: Asset) =>
        asset.derivedStatus !== 'Disposed' &&
        (warehouseId === null ||
          warehouseId === '' ||
          asset.currentWarehouse?.id === warehouseId) &&
        matchesSearch(asset, search)

      const matched = assets.filter(isEligible)
      const offset = pageIndex * size
      const items =
        order === 'filter-then-slice'
          ? matched.slice(offset, offset + size)
          : assets.slice(offset, offset + size).filter(isEligible)

      // Wire envelope: `data` is the item array and `pagination` is the
      // snake_case block. Wrapping the whole `{items, meta}` page in a success
      // envelope instead would leave `requestPage` reading `data.pagination` as
      // undefined, which is exactly the bug this suite exists to rule out.
      return okPageJson(items, {
        page: pageIndex + 1,
        pageSize: size,
        totalCount: matched.length,
        totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / size),
      })
    }),
  )
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function renderSelector(warehouseId: string) {
  return renderHook(() => useDisposalEligibleAssetSelector(warehouseId), {
    wrapper: createWrapper(),
  })
}

describe('disposal eligible assets: filter before page (D-ADJ-01)', () => {
  it('sends the debounced search, the selected warehouse, and the first page on every lookup', async () => {
    const seen: EligibleAssetsRequest[] = []
    serveEligibleAssets(SEED, seen)
    const { result } = renderSelector(TARGET_WAREHOUSE.id)

    await result.current.loadOptions(TARGET.assetNumber)

    // The selector always asks for page one. With server-side search there is no
    // unfiltered page for the operator to page through, so a non-zero page index
    // would hide the match rather than reveal more of it.
    expect(seen).toEqual([
      {
        page: '1',
        pageSize: '10',
        search: TARGET.assetNumber,
        warehouseId: TARGET_WAREHOUSE.id,
      },
    ])
  })

  it('keeps the match off the unfiltered first page, so a passing search proves filtering', async () => {
    // Non-vacuity, premise half. If this stopped holding — a shrunken seed, a
    // grown default page size — then the search assertion below would pass for
    // the wrong reason: the match would have been visible with no search at all,
    // and nothing about the endpoint's ordering would be proven.
    serveEligibleAssets(SEED, [])
    const { result } = renderSelector(TARGET_WAREHOUSE.id)

    const unfiltered = await result.current.loadOptions('')

    expect(unfiltered).toHaveLength(10)
    expect(unfiltered.map((option) => option.value)).not.toContain(TARGET.assetId)
  })

  it('returns a matching asset that an unfiltered first page would have hidden', async () => {
    serveEligibleAssets(SEED, [])
    const { result } = renderSelector(TARGET_WAREHOUSE.id)

    const options = await result.current.loadOptions(TARGET.assetNumber)

    expect(options).toEqual([
      {
        value: TARGET.assetId,
        label: `${TARGET.assetNumber} — ${TARGET.material.displayName}`,
        payload: TARGET,
      },
    ])
  })

  it('keeps the warehouse constraint effective while searching', async () => {
    serveEligibleAssets(SEED, [])
    const { result } = renderSelector(OTHER_WAREHOUSE.id)

    // Same search text, a warehouse that does not hold the asset: empty is the
    // required answer. A lookup that searched but dropped `warehouseId` would
    // offer assets from a warehouse the disposal cannot be recorded against —
    // a wrong-document risk, not a UX one.
    await expect(result.current.loadOptions(TARGET.assetNumber)).resolves.toEqual([])
  })

  it('finds nothing for the target when the server paginates before filtering', async () => {
    // The negative control: same seed, same hook, same search text — only the
    // ORDER differs. This is what the assertion above actually guards. Without
    // it, "the search found it" could be satisfied by a handler that ignored the
    // search and merely happened to serve the right row.
    serveEligibleAssets(SEED, [], 'slice-then-filter')
    const { result } = renderSelector(TARGET_WAREHOUSE.id)

    await expect(result.current.loadOptions(TARGET.assetNumber)).resolves.toEqual([])
  })
})
