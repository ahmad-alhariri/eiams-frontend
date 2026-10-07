import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

// Audit + inventory queries inside the recent-activity panel — give each test
// a deterministic empty fixture so the page renders cleanly.
vi.mock('@/modules/audit/hooks/use-audit-queries', () => ({
  useAuditLogsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/modules/inventory/hooks/use-inventory-queries', () => ({
  useInventoryBalancesQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/modules/inventory/hooks/use-inventory-queries', () => ({
  useInventoryBalancesQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}))

import ReportsPage from '@/modules/reports/pages/reports-page'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

describe('ReportsPage', () => {
  it('renders the Arabic page title and seven accessible tabs with the dashboard tab as default', async () => {
    render(<ReportsPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'التقارير' })).toBeInTheDocument()

    expect(screen.getByRole('tab', { name: 'لوحة المؤشرات' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'نشاط حديث' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'أرصدة المخزون' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'حركات المخزون' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'الأصول والتكليف' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'الجرد والتسويات' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'المستندات التشغيلية' })).toBeInTheDocument()
  })

  it('switches the active tab when a different tab is selected', async () => {
    const user = userEvent.setup()
    render(<ReportsPage />, { wrapper: createWrapper() })

    await screen.findByRole('heading', { level: 1, name: 'التقارير' })

    await user.click(screen.getByRole('tab', { name: 'أرصدة المخزون' }))

    expect(screen.getByRole('tab', { name: 'أرصدة المخزون' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'لوحة المؤشرات' })).toHaveAttribute('aria-selected', 'false')
  })
})
