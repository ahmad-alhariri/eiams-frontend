import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers/app-providers'
import { AppRouter, appRouter } from '@/app/app-router'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'

beforeEach(() => {
  useAuthSessionStore.setState({ status: 'unauthenticated' })
})

afterEach(() => {
  act(() => {
    appRouter.navigate('/')
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

function shellChrome() {
  return {
    banner: screen.getByRole('banner'),
    aside: screen.getByRole('complementary'),
    main: screen.getByRole('main', { name: 'محتوى الصفحة' }),
    footer: screen.getByRole('contentinfo'),
  }
}

function renderAppRouter() {
  return render(
    <AppProviders>
      <AppRouter />
    </AppProviders>,
  )
}

describe('App router surface', () => {
  it('mounts the anonymous login surface outside the application shell', async () => {
    render(
      <AppProviders>
        <AppRouter />
      </AppProviders>,
    )

    await act(async () => {
      await appRouter.navigate('/login')
    })

    expect(appRouter.state.location.pathname).toBe('/login')

    expect(
      await screen.findByRole('heading', { name: 'نظام إدارة المخزون والأصول' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('routes unlisted URLs to the Arabic not-found page', async () => {
    renderAppRouter()

    act(() => {
      appRouter.navigate('/definitely-not-a-route')
    })

    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
    expect(screen.getByText(/الرابط الذي حاولت الوصول إليه غير مسجّل/i)).toBeInTheDocument()
  })

  it('serves the dev gallery in development builds', async () => {
    renderAppRouter()

    act(() => {
      appRouter.navigate('/dev/gallery')
    })

    expect(
      await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    await waitFor(
      () => {
        expect(screen.getByText(/صفحة تطوير فقط/i)).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
  })
})

describe('App router resilience (e05-t08)', () => {
  it('keeps the whole shell chrome intact on an unlisted deep URL', async () => {
    renderAppRouter()

    act(() => {
      appRouter.navigate('/deep/unknown/path/here')
    })

    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
    const chrome = shellChrome()
    expect(chrome.banner).toBeInTheDocument()
    expect(chrome.aside).toBeInTheDocument()
    expect(chrome.main).toBeInTheDocument()
    expect(chrome.footer).toBeInTheDocument()
  })

  it('bounces between valid and unknown URLs without accumulating chrome', async () => {
    renderAppRouter()

    act(() => {
      appRouter.navigate('/dev/gallery')
    })
    await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' }, { timeout: 5000 })

    act(() => {
      appRouter.navigate('/one-off-link')
    })
    await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })

    act(() => {
      appRouter.navigate('/dev/gallery')
    })
    await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' }, { timeout: 5000 })

    // Exactly one ROUTE-LEVEL boundary at the top of main (the gallery page
    // itself contains an extra demo boundary for e05-t07's fixture section).
    await waitFor(
      () => {
        const routeBoundaries = document.querySelectorAll(
          '[data-slot="app-main"] > [data-slot="domain-error-boundary"]',
        )
        expect(routeBoundaries).toHaveLength(1)
        expect(document.querySelectorAll('header[data-slot="app-header"]')).toHaveLength(1)
        expect(document.querySelectorAll('[data-slot="app-main"]')).toHaveLength(1)
      },
      { timeout: 5000 },
    )
  })

  it('renders a single route-level boundary on unknown loads', async () => {
    renderAppRouter()

    act(() => {
      appRouter.navigate('/forgotten-page')
    })
    await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })

    await waitFor(() => {
      const routeBoundaries = document.querySelectorAll(
        '[data-slot="app-main"] > [data-slot="domain-error-boundary"]',
      )
      expect(routeBoundaries).toHaveLength(1)
    })
  })
})
