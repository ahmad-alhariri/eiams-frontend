import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { AssetMovementLedger } from './asset-movement-ledger'
import type { AssetMovement } from '@/modules/asset/types/asset.types'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

/** The LIVE `GET /assets/{assetId}/movements` row: flat, no warehouse routing. */
function movementRow(overrides: Partial<AssetMovement> = {}): AssetMovement {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    assetId: ASSET_ID,
    documentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    documentReferenceNumber: 'EIAMS-REC-2024-0101',
    documentType: 'Receiving',
    movementType: 'Received',
    movedAtUtc: '2024-03-01T09:00:00.000Z',
    ...overrides,
  }
}

function useMovementsHandler() {
  server.use(
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () =>
      okPageJson(
        [
          movementRow(),
          movementRow({
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            documentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            documentReferenceNumber: 'EIAMS-ISS-2026-0001',
            documentType: 'Issue',
            movementType: 'Issued',
            movedAtUtc: '2026-08-24T10:00:00.000Z',
          }),
        ],
        { page: 1, pageSize: 20, totalCount: 2, totalPages: 1 },
      ),
    ),
  )
}

function renderLedger() {
  const client = createQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <AssetMovementLedger assetId={ASSET_ID} />
    </QueryClientProvider>,
  )
}

describe('AssetMovementLedger', () => {
  it('renders one row per movement with the Arabic movement labels', async () => {
    useMovementsHandler()
    renderLedger()

    expect(await screen.findByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    // Document references and types render ltr in mono.
    expect(screen.getByText('EIAMS-REC-2024-0101')).toBeInTheDocument()
    expect(screen.getByText('EIAMS-ISS-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Receiving')).toBeInTheDocument()
    expect(screen.getByText('Issue')).toBeInTheDocument()
  })

  it('shows no warehouse routing columns, which the live row does not carry', async () => {
    useMovementsHandler()
    renderLedger()

    await screen.findByText('استلام')
    expect(screen.queryByText('من مستودع')).toBeNull()
    expect(screen.queryByText('إلى مستودع')).toBeNull()
    expect(screen.queryByText('بواسطة')).toBeNull()
  })

  it('shows the empty state when the asset has no movements', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () =>
        okPageJson([], { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }),
      ),
    )
    renderLedger()

    expect(await screen.findByText('لا توجد حركات')).toBeInTheDocument()
  })
})
