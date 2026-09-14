import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActiveScopeBadge } from '@/modules/auth/components/active-scope-badge'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: vi.fn(),
}))

const mockedUseActiveScopeContext = vi.mocked(useActiveScopeContext)

/**
 * The frozen provisional contract still declares `availableScopes` and
 * `scopeState` as required fields on `SessionResponse`. The D-SRS-01
 * singular-session refactor removed their consumer code in the frontend,
 * but the type is still imported from the deprecated generated artifact.
 * These fixtures satisfy the type until `whhu.5` deletes the generated
 * artifact entirely.
 */
const sessionFixture: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.keeper',
    displayName: 'أمين المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['document.view'],
  availableScopes: [],
  scopeState: 'Selected',
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    warehouseId: '20000000-0000-4000-8000-000000000001',
    siteId: '30000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  },
  activeRoles: [],
}

const SCOPE_KEY = { kind: 'warehouse', id: '20000000-0000-4000-8000-000000000001' } as const
const SITE_KEY = { kind: 'site', id: '30000000-0000-4000-8000-000000000001' } as const

function renderBadge() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveScopeBadge />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ActiveScopeBadge (D-SRS-01 singular-session read-only)', () => {
  it('renders the singular scope displayName from the hook', () => {
    mockedUseActiveScopeContext.mockReturnValue({
      activeScope: sessionFixture.activeScope,
      activeScopeCacheKey: SCOPE_KEY,
    })

    renderBadge()

    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
  })

  it('falls back to the scopeType Arabic label when displayName is absent', () => {
    const scopeWithoutName = { ...sessionFixture.activeScope!, displayName: '' }
    mockedUseActiveScopeContext.mockReturnValue({
      activeScope: scopeWithoutName,
      activeScopeCacheKey: SITE_KEY,
    })

    renderBadge()

    expect(screen.getByText('الموقع')).toBeInTheDocument()
  })

  it('renders a skeleton while the session is loading', () => {
    mockedUseActiveScopeContext.mockReturnValue({
      activeScope: undefined,
      activeScopeCacheKey: undefined,
    })

    const { container } = renderBadge()

    expect(container.firstChild).not.toBeNull()
    expect(screen.queryByText('المستودع المركزي')).not.toBeInTheDocument()
    expect(screen.getByLabelText('جارٍ تحميل نطاق العمل')).toBeInTheDocument()
  })
})
