import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { CountQuantityWorkspace } from './count-quantity-workspace'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000003'

interface SavedBody {
  countRowVersion: number
  lines: unknown[]
}

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'count.operator',
      displayName: 'مشغّل الجرد',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      { scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة العامة للرقابة والتفتيش' },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

let savedBody: SavedBody | undefined

function useHandlers() {
  savedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
      HttpResponse.json({
        items: [
          {
            countLineId: 'L1',
            material: { id: 'm1', displayName: 'حاسوب مكتبي' },
            snapshotQuantity: 25,
            actualQuantity: null,
            difference: 0,
            rowVersion: 1,
          },
          {
            countLineId: 'L2',
            material: { id: 'm2', displayName: 'طابعة ليزر' },
            snapshotQuantity: 2,
            actualQuantity: null,
            difference: 0,
            rowVersion: 1,
          },
        ],
        meta: { pageIndex: 0, pageSize: 50, totalItems: 2, totalPages: 1 },
      }),
    ),
    http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, async ({ request }) => {
      savedBody = (await request.json()) as SavedBody
      return HttpResponse.json({
        items: [
          {
            countLineId: 'L1',
            material: { id: 'm1', displayName: 'حاسوب مكتبي' },
            snapshotQuantity: 25,
            actualQuantity: 23,
            difference: -2,
            rowVersion: 2,
          },
          {
            countLineId: 'L2',
            material: { id: 'm2', displayName: 'طابعة ليزر' },
            snapshotQuantity: 2,
            actualQuantity: 2,
            difference: 0,
            rowVersion: 2,
          },
        ],
        meta: { pageIndex: 0, pageSize: 50, totalItems: 2, totalPages: 1 },
      })
    }),
  )
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.enter']))
  return render(
    <QueryClientProvider client={client}>
      <CountQuantityWorkspace countId={COUNT_ID} countRowVersion={1} />
    </QueryClientProvider>,
  )
}

describe('CountQuantityWorkspace (e20-t06)', () => {
  it('renders loaded lines with snapshot quantities and live difference', async () => {
    useHandlers()
    renderWorkspace()

    expect(await screen.findByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()

    const input = screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي') as HTMLInputElement
    await userEvent.type(input, '23')

    expect(screen.getAllByText('-2').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'حفظ (1)' })).toBeInTheDocument()
  }, 20000)

  it('persists only changed lines with batch PUT', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    const input = screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي') as HTMLInputElement
    await user.type(input, '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (1)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )

    expect(savedBody?.countRowVersion).toBe(1)
    expect(savedBody?.lines).toHaveLength(1)
    const first = savedBody?.lines?.[0] as { countLineId: string; actualQuantity: number }
    expect(first.countLineId).toBe('L1')
    expect(first.actualQuantity).toBe(23)
  }, 30000)

  it('renders asset lines with presence toggle and asset number (e20-t10)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json({
          items: [
            {
              countLineId: 'A1',
              assetId: 'aa000000-0000-4000-8000-0000000000aa',
              assetNumber: 'AST-1001',
              material: { id: 'm9', displayName: 'حاسوب محمول' },
              snapshotQuantity: 1,
              actualQuantity: null,
              difference: 0,
              rowVersion: 1,
            },
          ],
          meta: { pageIndex: 0, pageSize: 50, totalItems: 1, totalPages: 1 },
        }),
      ),
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, async ({ request }) => {
        savedBody = (await request.json()) as SavedBody
        return HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 50, totalItems: 0, totalPages: 1 },
        })
      }),
    )
    renderWorkspace()

    expect(await screen.findByText('حاسوب محمول')).toBeInTheDocument()
    expect(screen.getByText(/أصل مسلسل/)).toBeInTheDocument()
    expect(screen.getByText(/AST-1001/)).toBeInTheDocument()
    // No numeric quantity input for an asset line — presence toggle instead.
    expect(screen.queryByLabelText('الكمية الفعلية لـ حاسوب محمول')).toBeNull()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'تأكيد فقدان حاسوب محمول' }))
    await user.click(screen.getByRole('button', { name: 'حفظ (1)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    const first = savedBody?.lines?.[0] as { countLineId: string; actualQuantity: number }
    expect(first.countLineId).toBe('A1')
    expect(first.actualQuantity).toBe(0)
  }, 30000)
})
