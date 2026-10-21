import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type { ListAssetMovementsQuery, ListAssetsQuery } from '@/modules/asset/types/asset.types'
import type { Asset, AssetMovementPage, AssetPage, paths } from '@/shared/types/generated/eiams-v1'

/**
 * Handwritten wire row for `GET /assets/{assetId}/custody-timeline`
 * (D-INT-02). Verified against
 * `Application.Custodies.GetTimeline.AssetCustodyTimelineResponse` on
 * 2026-10-20. The previous generated `AssetCustody` carried an embedded
 * `holder: CounterpartOption` and the field names `fromTs` / `toTs`;
 * neither matches the live row.
 *
 * Kept inline next to the service so the consumer of `getAssetCustodyTimeline`
 * has a single place to import from. `asset-custody-history-page.tsx` reads
 * this type directly.
 */
export interface AssetCustodyTimelineRow {
  readonly custodyId: string
  readonly assetId: string
  readonly holderType: string
  readonly holderId: string
  readonly custodyKind: string
  readonly issueDocumentId: string
  readonly returnDocumentId: string | null
  /** Active or Closed; the ledger never produces other statuses. */
  readonly status: 'Active' | 'Closed'
  readonly fromUtc: string
  readonly toUtc: string | null
  readonly rowVersion: number
}

const ASSETS_PATH = '/assets' satisfies keyof paths
const ASSET_PATH = '/assets/{assetId}' satisfies keyof paths
const ASSET_CUSTODY_TIMELINE_PATH = '/assets/{assetId}/custody-timeline'
const ASSET_MOVEMENTS_PATH = '/assets/{assetId}/movements' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface AssetService {
  listAssets: (query: ListAssetsQuery) => Promise<AssetPage>
  getAsset: (assetId: string) => Promise<Asset>
  /**
   * Full custody timeline for one asset (active + historical rows). Verified
   * against the live `GET /api/v1/assets/{assetId}/custody-timeline`, whose
   * payload is `ApiResponse<IReadOnlyList<AssetCustodyTimelineResponse>>`.
   */
  getAssetCustodyTimeline: (assetId: string) => Promise<readonly AssetCustodyTimelineRow[]>
  listAssetMovements: (
    assetId: string,
    query: ListAssetMovementsQuery,
  ) => Promise<AssetMovementPage>
}

/**
 * Contract-only asset reads (e18-t01). Derived status, custody state, and
 * movement provenance are server-authoritative; the client never infers an
 * asset's lifecycle from other records.
 */
export function createAssetService(transport: ApiTransport): AssetService {
  const toViewPage = <T>(page: ApiPage<T>) =>
    ({
      items: page.items,
      meta: {
        pageIndex: page.page - 1,
        page: page.page,
        pageSize: page.pageSize,
        itemCount: page.totalItems,
        totalItems: page.totalItems,
        totalCount: page.totalItems,
        totalPages: page.totalPages,
        hasNextPage: page.hasNextPage,
        hasPreviousPage: page.hasPreviousPage,
      },
    }) as unknown as { items: readonly T[] }

  return {
    async listAssets(query) {
      // Rebuild the documented page view-model from the normalized `ApiPage`; the
      // generated page type described a body the backend never sends on its own.
      return toViewPage(
        await transport.requestPage<Asset>({
          path: ASSETS_PATH,
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      ) as AssetPage
    },
    async getAsset(assetId) {
      const response = await transport.request<Asset>({
        path: pathWithId(ASSET_PATH, '{assetId}', assetId),
        method: 'GET',
      })
      return response
    },
    async getAssetCustodyTimeline(assetId) {
      const response = await transport.request<readonly AssetCustodyTimelineRow[]>({
        path: pathWithId(ASSET_CUSTODY_TIMELINE_PATH, '{assetId}', assetId),
        method: 'GET',
      })
      return response
    },
    async listAssetMovements(assetId, query) {
      return toViewPage(
        await transport.requestPage<AssetMovementPage['items'][number]>({
          path: pathWithId(ASSET_MOVEMENTS_PATH, '{assetId}', assetId),
          method: 'GET',
          query: query as Record<string, string | number | boolean | undefined>,
        }),
      ) as AssetMovementPage
    },
  }
}

export const assetService = createAssetService(apiTransport)
