import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import CountDetailPage from './count-detail-page'
vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import { countNameHandlers } from '@/test/msw/count-wire-fixtures'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

const API_BASE_URL = '/api/v1'
const COUNT_ID = '773e4567-e89b-42d3-a456-426614174099'
const WAREHOUSE_ID = 'w1'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({
      firstName: '\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u062F',
    }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

let startedBody: { expectedRowVersion?: number } | undefined

/** The live count detail: flat DTO, no reference number, no nested objects. */
function countDetail(rowVersion: number, status: string) {
  return {
    id: COUNT_ID,
    warehouseId: WAREHOUSE_ID,
    countType: 'Cycle',
    scopeType: 'EntireWarehouse',
    freezePolicy: 'SoftFreeze',
    status,
    rowVersion,
    plannedAtUtc: '2026-08-25T09:00:00Z',
    startedAtUtc: status === 'Planned' ? null : '2026-08-25T10:00:00Z',
    completedAtUtc: null,
    closedAtUtc: null,
    abortedAtUtc: null,
    materialDomainId: null,
    summary: { totalLines: 0, countedLines: 0, varianceLines: 0, totalAbsoluteDifference: 0 },
    settlement: { status: 'NotRequired', adjustmentId: null, adjustmentStatus: null },
  }
}

function useHandlers() {
  startedBody = undefined
  server.use(
    http.get(API_BASE_URL + '/inventory-counts/' + COUNT_ID, () =>
      okJson(countDetail(1, 'Planned')),
    ),
    http.post(API_BASE_URL + '/inventory-counts/' + COUNT_ID + '/start', async ({ request }) => {
      startedBody = (await request.json()) as { expectedRowVersion?: number }
      return okJson(countDetail(2, 'InProgress'))
    }),
    ...countNameHandlers({
      warehouses: {
        [WAREHOUSE_ID]:
          '\u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639 \u0627\u0644\u0645\u0631\u0643\u0632\u064A',
      },
    }),
  )
}

function renderPage(permissionCodes: readonly string[] = ['count.view', 'count.plan']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/counts/' + COUNT_ID]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts/:countId" element={<CountDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const START = /\u0628\u062F\u0621 \u0627\u0644\u062C\u0644\u0633\u0629/
const SPINE =
  /\u062C\u0631\u062F \u062F\u0648\u0631\u064A — \u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639 \u0643\u0627\u0645\u0644\u0627\u064B/

describe('CountDetailPage (live count detail contract)', () => {
  it('shows the planned session spine, the warehouse name and the freeze policy', async () => {
    useHandlers()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(SPINE)
    expect(
      await screen.findByText(
        '\u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639 \u0627\u0644\u0645\u0631\u0643\u0632\u064A',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('\u062A\u062C\u0645\u064A\u062F \u0645\u0631\u0646 (SoftFreeze)').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: START })).toBeInTheDocument()
  }, 20000)

  it('hides the start action from a keeper without count.plan', async () => {
    useHandlers()
    renderPage(['count.view', 'count.enter'])

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: START })).toBeNull()
  }, 20000)

  it('starts the session with the count row version after confirmation', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('button', { name: START })
    await user.click(screen.getByRole('button', { name: START }))

    const confirmButton = await screen.findByRole('button', { name: START })
    await user.click(confirmButton)

    await waitFor(
      () => {
        expect(startedBody).toBeDefined()
      },
      { timeout: 8000 },
    )

    expect(startedBody?.expectedRowVersion).toBe(1)
  }, 30000)
})
