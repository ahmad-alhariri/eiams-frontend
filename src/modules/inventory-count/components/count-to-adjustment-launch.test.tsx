import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CountToAdjustmentLaunch } from '@/modules/inventory-count/components/count-to-adjustment-launch'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { InventoryCount } from '@/modules/inventory-count/types/inventory-count.types'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'
const WAREHOUSE_ID = '823e4567-e89b-42d3-a456-426614174008'
const ADJUSTMENT_ID = 'a23e4567-e89b-42d3-a456-426614174009'
/** The adjustment route (adjustmentNew) is gated by these three codes. */
const MANAGER_PERMISSIONS = ['count.view', 'document.view', 'document.create', 'document.post']

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({
      firstName: '\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639',
    }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

/** The live count detail: a flat DTO plus the server-owned settlement projection. */
function count(overrides: Partial<InventoryCount> = {}): InventoryCount {
  return {
    id: COUNT_ID,
    warehouseId: WAREHOUSE_ID,
    countType: 'Cycle',
    scopeType: 'EntireWarehouse',
    freezePolicy: 'SoftFreeze',
    status: 'Closed',
    rowVersion: 3,
    plannedAtUtc: '2026-08-20T08:00:00.000Z',
    startedAtUtc: '2026-08-20T09:00:00.000Z',
    completedAtUtc: '2026-08-20T10:00:00.000Z',
    closedAtUtc: null,
    abortedAtUtc: null,
    materialDomainId: null,
    summary: { totalLines: 4, countedLines: 4, varianceLines: 2, totalAbsoluteDifference: 5 },
    settlement: { status: 'Pending', adjustmentId: null, adjustmentStatus: null },
    ...overrides,
  }
}

function renderLaunch(
  value: InventoryCount,
  permissionCodes: readonly string[] = MANAGER_PERMISSIONS,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/counts/' + COUNT_ID]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts/:countId" element={<CountToAdjustmentLaunch count={value} />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const CREATE_DRAFT = /\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0648\u062F\u0629/
const GO_TO_DRAFT =
  /\u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0625\u0644\u0649 \u0645\u0633\u0648\u062F\u0629/

describe('CountToAdjustmentLaunch (F8 - settlement drives the CTA)', () => {
  // `NotRequired` is a SETTLEMENT state, never a count status: the statuses the
  // backend guard refuses are the real lifecycle ones.
  it.each(['Planned', 'InProgress', 'Completed', 'Aborted'] as const)(
    'hides the active launch for %s and shows the disabled explanation',
    (status) => {
      renderLaunch(count({ status }))
      expect(screen.getByRole('button', { name: CREATE_DRAFT })).toBeDisabled()
      expect(
        screen.getByText(/يتطلب إنشاء سند التسوية أن تكون جلسة الجرد مغلقة/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: GO_TO_DRAFT })).toBeNull()
    },
  )

  it('shows nothing for a closed count with no variance to settle', () => {
    renderLaunch(
      count({
        settlement: { status: 'NotRequired', adjustmentId: null, adjustmentStatus: null },
      }),
    )
    expect(screen.queryByRole('button', { name: CREATE_DRAFT })).toBeNull()
    expect(screen.queryByRole('link', { name: GO_TO_DRAFT })).toBeNull()
  })

  it('offers to create the settlement draft while the variance is unsettled', () => {
    renderLaunch(count())
    expect(screen.getByRole('button', { name: CREATE_DRAFT })).toBeVisible()
    expect(screen.queryByRole('link', { name: GO_TO_DRAFT })).toBeNull()
  })

  it('links to the existing draft instead of creating a second one', () => {
    renderLaunch(
      count({
        settlement: { status: 'Pending', adjustmentId: ADJUSTMENT_ID, adjustmentStatus: 'Draft' },
      }),
    )
    const link = screen.getByRole('link', { name: GO_TO_DRAFT })
    expect(link.getAttribute('href')).toBe('/adjustments/' + ADJUSTMENT_ID)
    expect(screen.queryByRole('button', { name: CREATE_DRAFT })).toBeNull()
  })

  it('hides the CTA from a keeper who may not create adjustments', () => {
    renderLaunch(count(), ['count.view', 'document.view', 'document.create'])
    expect(screen.queryByRole('button', { name: CREATE_DRAFT })).toBeNull()
    expect(screen.queryByRole('link', { name: GO_TO_DRAFT })).toBeNull()
  })

  it('shows nothing once the adjustment settled the variance', () => {
    renderLaunch(
      count({
        settlement: { status: 'Settled', adjustmentId: ADJUSTMENT_ID, adjustmentStatus: 'Posted' },
      }),
    )
    expect(screen.queryByRole('button', { name: CREATE_DRAFT })).toBeNull()
    expect(screen.queryByRole('link', { name: GO_TO_DRAFT })).toBeNull()
  })
})
