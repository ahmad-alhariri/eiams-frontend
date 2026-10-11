import { act, render, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers/app-providers'
import { AppRouter, appRouter } from '@/app/app-router'
import { ROUTE_PATHS } from '@/config/routes'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { queryClient } from '@/shared/services/query.client'
import { sessionAdapter } from '@/shared/services/api.client'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { apiJson, okJson } from '@/test/msw/envelope'
import { createSession, createSessionScope } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const USER_MENU_TRIGGER = 'قائمة المستخدم'

function authenticatedSession(): SessionResponse {
  return createSession({
    activeScope: createSessionScope({ scopeType: 'Warehouse' }),
    permissionCodes: ['inventory.view'],
  })
}
function signIn() {
  act(() => {
    queryClient.setQueryData(authSessionQueryKey, authenticatedSession())
    useAuthSessionStore.setState({ status: 'authenticated' })
  })
  server.use(
    // `okJson`, not a bare `HttpResponse.json(session)`. `auth.service.ts` reads
    // this through `ApiTransport.request`, which unwraps `response.data.data` —
    // so a bare payload made `session` `undefined` and this handler was serving
    // a shape the code under test cannot read. It passed only because the
    // store was seeded directly two lines above, bypassing the fetch entirely.
    http.get(`${API_BASE_URL}/auth/session`, () => okJson(authenticatedSession())),
  )
}

beforeEach(() => {
  useAuthSessionStore.setState({ status: 'unauthenticated' })
})

afterEach(() => {
  act(() => {
    appRouter.navigate('/')
    queryClient.clear()
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

/**
 * The session user menu is injected at the protected `AppLayout` branch only
 * (e24-t10). The dev-gallery and not-found branches render the same frame and
 * must never show it: there is no session identity to sign out of there.
 */
describe('Session user menu wiring (e24-t10)', () => {
  it('mounts the user menu in the protected shell', async () => {
    signIn()
    renderAppRouter()

    await act(async () => {
      await appRouter.navigate(ROUTE_PATHS.dashboard)
    })

    expect(await screen.findByRole('button', { name: USER_MENU_TRIGGER })).toBeInTheDocument()
  })

  it('keeps the user menu off the not-found branch', async () => {
    signIn()
    renderAppRouter()

    await act(async () => {
      await appRouter.navigate('/not-a-real-route')
    })

    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: USER_MENU_TRIGGER })).not.toBeInTheDocument()
  })

  it('serves the declared profile and settings placeholder routes', async () => {
    signIn()
    renderAppRouter()

    await act(async () => {
      await appRouter.navigate(ROUTE_PATHS.profile)
    })
    expect(appRouter.state.location.pathname).toBe(ROUTE_PATHS.profile)
    expect(await screen.findByRole('heading', { name: 'الملف الشخصي' })).toBeInTheDocument()

    await act(async () => {
      await appRouter.navigate(ROUTE_PATHS.settings)
    })
    expect(appRouter.state.location.pathname).toBe(ROUTE_PATHS.settings)
    expect(await screen.findByRole('heading', { name: 'الإعدادات' })).toBeInTheDocument()
  })
})

/**
 * The navigation half of D-AUTH-01 §"Token and session lifecycle".
 *
 * `AuthSessionExpiredBridge` shipped with a passing unit test and was still never
 * mounted, because a component test renders the component — nothing asserted it
 * was reachable from the route tree. This suite drives the REAL router
 * composition and the REAL `sessionAdapter` singleton, so deleting the mount from
 * `app-router.tsx` fails here.
 *
 * The not-found branch is the discriminating URL on purpose. It renders
 * `AppLayout` with NO `RequireActiveScope` and no user menu, so nothing but the
 * bridge can move the URL when a refresh fails. Asserting this on a protected
 * route would pass whether or not the bridge existed, because the guard reaches
 * `/login` by itself — which is precisely how the defect survived review.
 */
describe('AuthSessionExpiredBridge wiring (D-AUTH-01)', () => {
  it('returns an authenticated user on an unguarded route to the Arabic login surface', async () => {
    signIn()
    renderAppRouter()

    act(() => {
      appRouter.navigate('/not-a-real-route')
    })
    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()

    // A real refresh failure on the singleton adapter, so the event under test is
    // the transport's own `session-expired` publication rather than a hand-fired
    // stub.
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        apiJson({ code: 'USERS_INVALID_REFRESH_TOKEN' }, { status: 401 }),
      ),
    )

    await act(async () => {
      await sessionAdapter.refreshSession().catch(() => undefined)
    })

    await waitFor(() => expect(appRouter.state.location.pathname).toBe(ROUTE_PATHS.login))
    expect(
      await screen.findByRole('heading', { name: 'نظام إدارة المخزون والأصول' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'الصفحة غير موجودة' })).not.toBeInTheDocument()
  })
})
