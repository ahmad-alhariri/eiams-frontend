import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { AssetMovementLedger } from './asset-movement-ledger'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ASSET_ID = fixtureUuid(230)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

function useMovementsHandler() {
  server.use(
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () =>
      HttpResponse.json({
        items: [
          {
            assetId: ASSET_ID,
            documentId: fixtureUuid(150),
            documentLineId: fixtureUuid(160),
            documentReference: 'EIAMS-REC-2024-0101',
            eventType: 'Received',
            movementId: fixtureUuid(240),
            occurredAt: '2024-03-01T09:00:00.000Z',
            occurredBy: { displayName: 'مريم الحلبي', id: fixtureUuid(12) },
            toWarehouse: {
              displayName: 'المستودع المركزي',
              id: fixtureUuid(30),
            },
          },
          {
            assetId: ASSET_ID,
            custodyId: fixtureUuid(51),
            documentId: fixtureUuid(151),
            documentLineId: fixtureUuid(161),
            documentReference: 'EIAMS-ISS-2026-0001',
            eventType: 'Issued',
            fromWarehouse: {
              displayName: 'المستودع المركزي',
              id: fixtureUuid(30),
            },
            movementId: fixtureUuid(241),
            occurredAt: '2026-08-24T10:00:00.000Z',
            occurredBy: { displayName: 'مدير النظام', id: fixtureUuid(11) },
          },
        ],
        meta: { pageIndex: 0, pageSize: 20, totalItems: 2, totalPages: 1 },
      }),
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

describe('AssetMovementLedger (e18-t05)', () => {
  it('renders one immutable event row per movement with Arabic event labels', async () => {
    useMovementsHandler()
    renderLedger()

    expect(await screen.findByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    // Document references render ltr in mono.
    expect(screen.getByText('EIAMS-REC-2024-0101')).toBeInTheDocument()
    expect(screen.getByText('EIAMS-ISS-2026-0001')).toBeInTheDocument()
    // Warehouse routing columns.
    expect(screen.getAllByText('المستودع المركزي').length).toBeGreaterThan(0)
  })

  it('shows the empty state when the asset has no movements', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () =>
        HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
      ),
    )
    renderLedger()

    expect(await screen.findByText('لا توجد حركات')).toBeInTheDocument()
  })
})
