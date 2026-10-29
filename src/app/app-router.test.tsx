import { act, configure, getConfig, render, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

/**
 * The dev gallery is a LAZY route (`route-registry.tsx`), so its module graph —
 * twenty demo components plus the shared UI they pull in — is transformed on
 * demand, the first time the route is visited. That transform is CPU-bound and
 * it was being charged to the GALLERY ASSERTION's budget: under full-suite
 * parallel load the transform outlasted the 5000 ms the assertion allowed, and
 * the test failed while React was still showing the Suspense fallback
 * (`جارٍ تحميل الصفحة...`) even though the gallery rendered correctly a moment
 * later.
 *
 * Importing the page HERE moves that one-off transform into this file's import
 * phase, where no assertion budget applies, so the lazy `import()` inside
 * `React.lazy` resolves from the module cache and the assertions below measure
 * the gallery's RENDER instead of the bundler's transform speed. The route is
 * still lazy and still rendered through the real router — only the cost of
 * building the chunk moves.
 *
 * Measured (30-way CPU contention, `src/app/app-router.test.tsx`): the gallery
 * assertion 5038 ms and FAILING without this import, 2596 ms and passing with
 * it, on the same load.
 */
import '@/app/gallery/gallery-page'

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

/**
 * WHY THIS SUITE CARRIES ITS OWN ASYNC-ASSERTION BUDGET
 * ------------------------------------------------------
 *
 * Every route this file drives is served by a LAZY page (`route-registry.tsx`),
 * so each assertion waits for a module graph to be transformed, evaluated and
 * rendered before the element it looks for exists. RTL's DEFAULT 1000 ms
 * `findBy*` / `waitFor` budget is what bounds that wait, and under full-suite
 * parallel load (300+ files, 15 workers on 16 logical CPUs) the CPU-bound
 * transform and render are served late enough to exhaust it — the assertion
 * then fails on a page that renders correctly a moment later. That is why this
 * suite failed with "Unable to find role=\"heading\"" while the DOM still held
 * the Suspense fallback.
 *
 * Vitest's own `testTimeout` (20 s, `vite.config.ts`) is a DIFFERENT budget and
 * never applies to an RTL assertion, so no global timeout override can fix
 * this: the budget has to be scoped to the suite, exactly as it is in
 * `user-detail-page.test.tsx` and `asset-disposal-form-page.test.tsx`.
 *
 * The budget is scoped to THIS FILE and restored afterwards; no global override
 * is added and no assertion is relaxed — a wrong element still fails, it just
 * fails after the lazy chunk has had time to land. 10 s leaves room for the
 * slowest measured lazy render (3216 ms under 30-way CPU contention) and still
 * fits inside the suite's own 20 s test budget.
 */
const ASYNC_ASSERTION_TIMEOUT = 10_000

const defaultAsyncUtilTimeout = getConfig().asyncUtilTimeout
beforeAll(() => configure({ asyncUtilTimeout: ASYNC_ASSERTION_TIMEOUT }))
afterAll(() => configure({ asyncUtilTimeout: defaultAsyncUtilTimeout }))

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
      await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/صفحة تطوير فقط/i)).toBeInTheDocument()
    })
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
    await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' })

    act(() => {
      appRouter.navigate('/one-off-link')
    })
    await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })

    act(() => {
      appRouter.navigate('/dev/gallery')
    })
    await screen.findByRole('heading', { name: 'معرض المكونات المشتركة' })

    // Exactly one ROUTE-LEVEL boundary at the top of main (the gallery page
    // itself contains an extra demo boundary for e05-t07's fixture section).
    await waitFor(() => {
      const routeBoundaries = document.querySelectorAll(
        '[data-slot="app-main"] > [data-slot="domain-error-boundary"]',
      )
      expect(routeBoundaries).toHaveLength(1)
      expect(document.querySelectorAll('header[data-slot="app-header"]')).toHaveLength(1)
      expect(document.querySelectorAll('[data-slot="app-main"]')).toHaveLength(1)
    })
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
