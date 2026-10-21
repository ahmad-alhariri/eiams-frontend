import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ActiveCountWarning } from './active-count-warning'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '553e4567-e89b-42d3-a456-426614174005'
const FREEZE_PATH = API_BASE_URL + '/warehouses/' + WAREHOUSE_ID + '/inventory-freeze-status'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: '\u0645\u062f\u064A\u0631 \u0627\u0644\u062C\u0631\u062F' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

/** The live freeze-status payload (F9 endpoint). */
function freezeStatus(overrides: Record<string, unknown> = {}) {
  return okJson({
    warehouseId: WAREHOUSE_ID,
    isPostingBlocked: false,
    isProvisional: true,
    hasSoftFreezeWarning: true,
    activeCounts: [{ countId: 'active-1', freezePolicy: 'SoftFreeze' }],
    ...overrides,
  })
}

function renderWarning(warehouseId: string = WAREHOUSE_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.plan']))
  return render(
    <QueryClientProvider client={client}>
      <ActiveCountWarning warehouseId={warehouseId} />
    </QueryClientProvider>,
  )
}

describe('ActiveCountWarning (live freeze-status contract)', () => {
  it('warns that a SoftFreeze count is running for the warehouse', async () => {
    server.use(
      http.get(FREEZE_PATH, () => freezeStatus()),
    )
    renderWarning()

    expect(
      await screen.findByText(/\u062A\u0646\u0628\u064A\u0647 \u062A\u062C\u0645\u064A\u062F \u0645\u0631\u0646/),
    ).toBeInTheDocument()
    expect(screen.getByText(/\u062C\u0631\u062F \u062C\u0627\u0631\u064D \u0628\u0633\u064A\u0627\u0633\u0629/)).toBeInTheDocument()
  }, 15000)

  it('says the stock movement is blocked while a HardFreeze count is active', async () => {
    server.use(
      http.get(FREEZE_PATH, () =>
        freezeStatus({
          isPostingBlocked: true,
          hasSoftFreezeWarning: false,
          activeCounts: [{ countId: 'active-1', freezePolicy: 'HardFreeze' }],
        }),
      ),
    )
    renderWarning()

    expect(
      await screen.findByText(/\u062D\u0631\u0643\u0629 \u0627\u0644\u0645\u062E\u0632\u0648\u0646/),
    ).toBeInTheDocument()
  }, 15000)

  it('renders nothing when the warehouse has no freeze signal at all', async () => {
    let requested = false
    server.use(
      http.get(FREEZE_PATH, () => {
        requested = true
        return freezeStatus({
          isPostingBlocked: false,
          isProvisional: false,
          hasSoftFreezeWarning: false,
          activeCounts: [],
        })
      }),
    )
    const { container } = renderWarning()

    await waitFor(() => expect(requested).toBe(true))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  }, 15000)

  it('renders nothing before a warehouse is selected', () => {
    const { container } = renderWarning('')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
