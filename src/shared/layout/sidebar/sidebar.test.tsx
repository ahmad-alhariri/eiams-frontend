import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SIDEBAR_NAV_GROUPS } from '@/shared/layout/sidebar/sidebar-nav-model'
import { Sidebar } from '@/shared/layout/sidebar/sidebar'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import { useUiStore } from '@/shared/store/ui.store'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

type Mql = {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

function createMatchMedia(matches: boolean, media: string): Mql {
  return {
    matches,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

function setViewportTier(tier: 'lg' | 'narrow') {
  const matches = tier === 'lg'
  window.matchMedia = vi.fn((query: string) =>
    createMatchMedia(matches, query),
  ) as unknown as typeof window.matchMedia
}

function renderSidebar(hasPermission?: (codes: readonly string[], mode: 'all' | 'any') => boolean) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/warehouses']}>
        <Sidebar hasPermission={hasPermission ?? (() => true)} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  const activeScope = {
    scopeType: 'Warehouse' as const,
    scopeId: '20000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  }

  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes,
    availableScopes: [activeScope],
    activeScope,
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function renderSessionSidebar(session: SessionResponse) {
  const queryClient = createQueryClient()
  queryClient.setQueryData(authSessionQueryKey, session)

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/warehouses']}>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

function getAside() {
  return screen.getByRole('complementary')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarDrawerOpen: false })
  setViewportTier('lg')
})

describe('Sidebar', () => {
  it('renders every nav group with Arabic headers', () => {
    renderSidebar()

    for (const group of SIDEBAR_NAV_GROUPS) {
      expect(screen.getByRole('heading', { name: group.labelAr })).toBeInTheDocument()
    }
    expect(screen.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeInTheDocument()
  })

  it('renders the scope slot', () => {
    renderSidebar()
    expect(screen.getByText('لم يُحدّد نطاق العمل')).toBeInTheDocument()
  })

  it('filters the canonical manifest and shows the active scope from the session cache', async () => {
    const { queryClient } = renderSessionSidebar(sessionWith(['warehouse.view']))

    expect(screen.getByRole('link', { name: 'المستودعات' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'سندات الاستلام' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('نطاق العمل الحالي: المستودع المركزي')).toBeInTheDocument()

    act(() => {
      queryClient.setQueryData(authSessionQueryKey, sessionWith(['document.view']))
    })

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'المستودعات' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'سندات الاستلام' })).toBeInTheDocument()
    })
  })

  it('marks the active route item and gives inactive items default styling', () => {
    renderSidebar()

    const warehousesLink = screen.getByRole('link', { name: /المستودعات/ })
    expect(warehousesLink).toHaveAttribute('aria-current', 'page')

    const domainsLink = screen.getByRole('link', { name: /مجالات التصنيف/ })
    expect(domainsLink).not.toHaveAttribute('aria-current')
  })

  it('turns the active item icon white (ui-design 4.3)', () => {
    renderSidebar()

    const activeIcon = screen.getByRole('link', { name: /المستودعات/ }).querySelector('svg')
    const inactiveIcon = screen.getByRole('link', { name: /مجالات التصنيف/ }).querySelector('svg')

    expect(activeIcon).toHaveClass('text-sidebar-accent-foreground')
    expect(inactiveIcon).toHaveClass('text-golden-wheat')
    expect(inactiveIcon).not.toHaveClass('text-sidebar-accent-foreground')
  })

  it('does not mark the home item active on other routes (exact match only)', () => {
    renderSidebar()

    const homeLink = screen.getByRole('link', { name: /لوحة المعلومات/ })
    expect(homeLink).not.toHaveAttribute('aria-current')
  })

  it('collapses to an icon-only rail on lg+ when the store says so', () => {
    useUiStore.setState({ sidebarCollapsed: true })
    renderSidebar()

    const aside = getAside()
    expect(aside).toHaveClass('lg:w-16')
    expect(within(aside).queryByText('المستودعات')).not.toBeInTheDocument()
    expect(aside.querySelector('a[title="المستودعات"]')).not.toBeNull()
  })

  it('expands to the 260px surface on lg+ by default', () => {
    renderSidebar()
    expect(getAside()).toHaveClass('lg:w-[260px]')
  })

  it('renders an icons-only rail at the md–lg tier regardless of the store', () => {
    useUiStore.setState({ sidebarCollapsed: false })
    setViewportTier('narrow')
    renderSidebar()

    const aside = getAside()
    expect(aside).toHaveClass('md:w-16')
    // Effective icons-only rendering: labels hidden, tooltips available. Actual
    // computed-style tier behavior is covered by browser QA (jsdom has no layout).
    expect(within(aside).queryByText('المستودعات')).not.toBeInTheDocument()
    expect(aside.querySelector('a[title="المستودعات"]')).not.toBeNull()
  })

  it('hides the closed drawer surface below md', () => {
    setViewportTier('narrow')
    renderSidebar()

    expect(getAside()).toHaveClass('max-md:hidden')
  })

  it('opens as a drawer with labels on small screens and locks body scroll', async () => {
    const user = userEvent.setup()
    setViewportTier('narrow')
    renderSidebar()

    act(() => {
      useUiStore.setState({ sidebarDrawerOpen: true })
    })

    const aside = getAside()
    expect(aside.className).toContain('max-md:block')
    expect(within(aside).getByText('لم يُحدّد نطاق العمل')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(useUiStore.getState().sidebarDrawerOpen).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes the drawer on backdrop click', async () => {
    const user = userEvent.setup()
    setViewportTier('narrow')
    renderSidebar()

    useUiStore.setState({ sidebarDrawerOpen: true })

    const backdrop = document.querySelector('[data-slot="sidebar-backdrop"]')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    expect(useUiStore.getState().sidebarDrawerOpen).toBe(false)
  })

  it('omits restricted items and their group when a holder denies a code', () => {
    const hasPermission = (codes: readonly string[]) =>
      codes.every((code) => code !== 'document.view')
    renderSidebar(hasPermission)

    expect(screen.queryByRole('link', { name: /سندات الاستلام/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'المستندات' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'التقارير' })).toBeInTheDocument()
  })
})
