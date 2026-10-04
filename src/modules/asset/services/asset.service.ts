import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'

import type { ListAssetMovementsQuery, ListAssetsQuery } from '@/modules/asset/types/asset.types'
import type {
  Asset,
  AssetCustody,
  AssetMovementPage,
  AssetPage,
  paths,
} from '@/shared/types/generated/eiams-v1'

const ASSETS_PATH = '/assets' satisfies keyof paths
const ASSET_PATH = '/assets/{assetId}' satisfies keyof paths
const ASSET_CUSTODY_PATH = '/assets/{assetId}/custody' satisfies keyof paths
const ASSET_MOVEMENTS_PATH = '/assets/{assetId}/movements' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface AssetService {
  listAssets: (query: ListAssetsQuery) => Promise<AssetPage>
  getAsset: (assetId: string) => Promise<Asset>
  /** Full custody timeline for one asset (active + historical rows). */
  getAssetCustodyTimeline: (assetId: string) => Promise<readonly AssetCustody[]>
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
      const response = await transport.request<readonly AssetCustody[]>({
        path: pathWithId(ASSET_CUSTODY_PATH, '{assetId}', assetId),
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
