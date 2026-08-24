import type { AxiosInstance } from 'axios'

import type {
  ListAssetMovementsQuery,
  ListAssetsQuery,
} from '@/modules/asset/types/asset.types'
import { apiClient } from '@/shared/services/api.client'
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
export function createAssetService(client: AxiosInstance): AssetService {
  return {
    async listAssets(query) {
      const response = await client.get<AssetPage>(ASSETS_PATH, { params: query })
      return response.data
    },
    async getAsset(assetId) {
      const response = await client.get<Asset>(pathWithId(ASSET_PATH, '{assetId}', assetId))
      return response.data
    },
    async getAssetCustodyTimeline(assetId) {
      const response = await client.get<readonly AssetCustody[]>(
        pathWithId(ASSET_CUSTODY_PATH, '{assetId}', assetId),
      )
      return response.data
    },
    async listAssetMovements(assetId, query) {
      const response = await client.get<AssetMovementPage>(
        pathWithId(ASSET_MOVEMENTS_PATH, '{assetId}', assetId),
        { params: query },
      )
      return response.data
    },
  }
}

export const assetService = createAssetService(apiClient)
