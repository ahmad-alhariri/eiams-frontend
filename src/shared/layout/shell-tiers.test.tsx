import { act, cleanup, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppLayout } from '@/shared/layout/app-layout'
import { createQueryClient } from '@/shared/services/query.client'
import { useUiStore } from '@/shared/store/ui.store'

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

/**
 * Shell tier matrix (e05-t08): jsdom has no layout engine, so tiers are
 * stubbed through window.matchMedia('(min-width: 1024px)') — the exact query
 * useIsLgViewport subscribes to — and assertions target the responsive classes
 * that implement each tier, the same proxy the sidebar tests already use.
 */
function setViewportTier(tier: 'narrow' | 'md' | 'lg') {
  const matches = tier === 'lg'
  window.matchMedia = vi.fn((query: string) =>
    createMatchMedia(matches, query),
  ) as unknown as typeof window.matchMedia
}

interface TierMatrixRow {
  tier: 'narrow' | 'md' | 'lg'
  sidebarSurface: string
  labelsShown: boolean
}

const TIER_MATRIX: TierMatrixRow[] = [
  {
    tier: 'lg',
    sidebarSurface: 'lg:w-[260px]',
    labelsShown: true,
  },
  {
    tier: 'md',
    sidebarSurface: 'md:w-16',
    labelsShown: false,
  },
  {
    tier: 'narrow',
    sidebarSurface: 'max-md:hidden',
    labelsShown: false,
  },
]

function renderShellAt(location = '/warehouses') {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout hasPermission={() => true} />,
        children: [
          { path: location, element: <div data-testid="page-content">محتوى الصفحة</div> },
          { path: '*', element: <div data-testid="page-content">محتوى الصفحة</div> },
        ],
      },
    ],
    { initialEntries: [location] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function headerBreadcrumbRegion() {
  return document.querySelector('[data-slot="app-header-breadcrumb"]')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarDrawerOpen: false })
  setViewportTier('lg')
})

describe('Shell tier matrix', () => {
  it.each(TIER_MATRIX)(
    '$tier: $sidebarSurface, labels=$labelsShown, rail=$railOnly',
    ({ tier, sidebarSurface, labelsShown }) => {
      setViewportTier(tier)
      renderShellAt()

      const aside = screen.getByRole('complementary')
      expect(aside).toHaveClass(sidebarSurface)

      const labels = within(aside).queryAllByText(/المستودعات|لوحة المعلومات/)
      expect(labels.length > 0).toBe(labelsShown)
    },
  )

  it('declares the header trigger contract once for every tier', () => {
    for (const tier of ['lg', 'md', 'narrow'] as const) {
      cleanup()
      setViewportTier(tier)
      renderShellAt()

      const drawerToggle = screen.getByRole('button', { name: 'فتح قائمة التنقل' })
      expect(drawerToggle).toHaveClass('lg:hidden')
      const collapse = screen.getByRole('button', { name: 'طي القائمة الجانبية' })
      expect(collapse).toHaveClass('hidden lg:flex')
    }
  })

  it('collapsed lg shows the icon rail with tooltips and an expanded-state toggle', () => {
    useUiStore.setState({ sidebarCollapsed: true })
    renderShellAt()

    expect(screen.getByRole('complementary')).toHaveClass('lg:w-16')
    expect(screen.getByRole('complementary')).not.toHaveClass('lg:w-[260px]')
    const aside = screen.getByRole('complementary')
    expect(within(aside).queryByText('المستودعات')).not.toBeInTheDocument()
    expect(aside.querySelector('a[title="المستودعات"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'توسيع القائمة الجانبية' })).toBeInTheDocument()
  })

  it('lg shows the breadcrumb trail region and hides the drawer trigger', () => {
    renderShellAt()

    expect(headerBreadcrumbRegion()).toHaveClass('lg:flex')
    expect(screen.getByRole('button', { name: 'فتح قائمة التنقل' })).toHaveClass('lg:hidden')
  })

  it('below lg the breadcrumb region stays hidden', () => {
    setViewportTier('md')
    renderShellAt()

    expect(headerBreadcrumbRegion()).toHaveClass('hidden')
  })

  it('narrow opens the off-canvas drawer with labels while the surface stays hidden on lg classes', () => {
    setViewportTier('narrow')
    renderShellAt()

    const aside = screen.getByRole('complementary')
    expect(aside).toHaveClass('max-md:hidden')

    act(() => {
      useUiStore.setState({ sidebarDrawerOpen: true })
    })

    expect(aside).toHaveClass('max-md:block')
    expect(within(aside).getByText('لم يُحدّد نطاق العمل')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('keeps the four chrome landmarks at every tier', () => {
    for (const tier of ['narrow', 'md', 'lg'] as const) {
      cleanup()
      setViewportTier(tier)
      useUiStore.setState({ sidebarCollapsed: false, sidebarDrawerOpen: false })
      renderShellAt('/catalog')

      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('complementary')).toBeInTheDocument()
      expect(screen.getByRole('main', { name: 'محتوى الصفحة' })).toBeInTheDocument()
      expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    }
  })
})
