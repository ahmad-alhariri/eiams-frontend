import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CountToAdjustmentLaunch } from './count-to-adjustment-launch'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { InventoryCount, SessionResponse } from '@/shared/types/generated/eiams-v1'
import { fixtureUuid } from '@/test/msw/factories'

const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'
const WAREHOUSE_ID = '823e4567-e89b-42d3-a456-426614174008'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'adjustment.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function completedCount(): InventoryCount {
  return {
    countId: COUNT_ID,
    countType: 'Full',
    createdAt: '2026-08-20T08:00:00.000Z',
    createdBy: { id: fixtureUuid(90), displayName: 'مدير الجرد' },
    freezePolicy: 'SoftFreeze',
    lineCount: 4,
    referenceNumber: 'EIAMS-CNT-2026-0101',
    rowVersion: 3,
    scope: { scopeIds: [], scopeType: 'AllMaterials' },
    startedAt: '2026-08-20T09:00:00.000Z',
    status: 'Completed',
    varianceCount: 2,
    warehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
  }
}

function renderLaunch(count: InventoryCount, permissionCodes: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={[`/counts/${COUNT_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts/:countId" element={<CountToAdjustmentLaunch count={count} />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CountToAdjustmentLaunch (e21-t03)', () => {
  it('renders the launch CTA for an eligible manager with full count context', () => {
    renderLaunch(completedCount(), ['count.view', 'document.create'])

    const cta = screen.getByRole('link', { name: 'إنشاء سند تسوية لفروقات الجلسة' })
    expect(cta.getAttribute('href')).toBe(
      `/adjustments/new?countId=${COUNT_ID}&purpose=CountVariance&warehouseId=${WAREHOUSE_ID}`,
    )
  })

  it('hides the CTA entirely for a user without document.create (keeper view)', () => {
    renderLaunch(completedCount(), ['count.view'])

    expect(screen.queryByRole('link', { name: 'إنشاء سند تسوية لفروقات الجلسة' })).toBeNull()
    expect(screen.queryByText('إنشاء سند تسوية')).toBeNull()
  })

  it('encodes identifiers safely in the query string', () => {
    const count = {
      ...completedCount(),
      countId: 'id-with-سبيشل?chars',
      warehouse: { id: 'wh&with=params', displayName: 'المستودع' },
    }
    renderLaunch(count, ['document.create'])

    const href = screen
      .getByRole('link', { name: 'إنشاء سند تسوية لفروقات الجلسة' })
      .getAttribute('href')
    expect(href).toContain(`countId=${encodeURIComponent('id-with-سبيشل?chars')}`)
    expect(href).toContain(`warehouseId=${encodeURIComponent('wh&with=params')}`)
  })
})
