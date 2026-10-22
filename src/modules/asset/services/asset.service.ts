import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'

import type {
  Asset,
  AssetCurrentStatusInfo,
  AssetCustodyTimelineRow,
  AssetDetails,
  AssetMovement,
  ListAssetMovementsQuery,
  ListAssetsQuery,
} from '@/modules/asset/types/asset.types'

const ASSETS_PATH = '/assets'
const ASSET_PATH = '/assets/{assetId}'
const ASSET_CURRENT_STATUS_PATH = '/assets/{assetId}/current-status'
const ASSET_CUSTODY_TIMELINE_PATH = '/assets/{assetId}/custody-timeline'
const ASSET_MOVEMENTS_PATH = '/assets/{assetId}/movements'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

/**
 * Sends a list query through the ONE shared pagination clamp.
 *
 * `page` is ONE-based on both sides (`useServerPagination` and the wire
 * `PaginationQueryParameters.Page` is `Range(1, 21474836)`), so the helper
 * only clamps it. The previous `pageIndex` was forwarded verbatim, which put
 * `pageIndex=0` on the wire — a parameter the server does not bind, so every
 * list stayed on its first page.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): Record<string, string | number | boolean | undefined> {
  const { page, pageSize, ...filters } = query
  return {
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  }
}

export interface AssetService {
  listAssets: (query: ListAssetsQuery) => Promise<ApiPage<Asset>>
  getAsset: (assetId: string) => Promise<AssetDetails>
  /**
   * The DERIVED status projection (`v_asset_current_status`) of one asset:
   * where the asset stands right now, who holds it, and its last movement.
   */
  getAssetCurrentStatus: (assetId: string) => Promise<AssetCurrentStatusInfo>
  /**
   * Full custody timeline for one asset (active + historical rows), served by
   * `GET /api/v1/assets/{assetId}/custody-timeline` as a paged envelope; the
   * first page is requested at the server's maximum page size so the ledger
   * shows the whole history of one asset in one read.
   */
  getAssetCustodyTimeline: (assetId: string) => Promise<readonly AssetCustodyTimelineRow[]>
  listAssetMovements: (
    assetId: string,
    query: ListAssetMovementsQuery,
  ) => Promise<ApiPage<AssetMovement>>
}

/**
 * Contract-only asset reads.
 *
 * Every payload here is the LIVE flat row (see `types/asset.types.ts`); the
 * server owns the derived status, the custody state and the movement
 * provenance, and the client never infers an asset's lifecycle from other
 * records.
 */
export function createAssetService(transport: ApiTransport): AssetService {
  return {
    async listAssets(query) {
      return transport.requestPage<Asset>({
        path: ASSETS_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },
    async getAsset(assetId) {
      return transport.request<AssetDetails>({
        path: pathWithId(ASSET_PATH, '{assetId}', assetId),
        method: 'GET',
      })
    },
    async getAssetCurrentStatus(assetId) {
      return transport.request<AssetCurrentStatusInfo>({
        path: pathWithId(ASSET_CURRENT_STATUS_PATH, '{assetId}', assetId),
        method: 'GET',
      })
    },
    async getAssetCustodyTimeline(assetId) {
      return transport.request<readonly AssetCustodyTimelineRow[]>({
        path: pathWithId(ASSET_CUSTODY_TIMELINE_PATH, '{assetId}', assetId),
        method: 'GET',
        query: { page: 1, pageSize: 100 },
      })
    },
    async listAssetMovements(assetId, query) {
      return transport.requestPage<AssetMovement>({
        path: pathWithId(ASSET_MOVEMENTS_PATH, '{assetId}', assetId),
        method: 'GET',
        query: withWirePagination(query),
      })
    },
  }
}

export const assetService = createAssetService(apiTransport)
