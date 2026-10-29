import { act, configure, getConfig, render, screen } from '@testing-library/react'
import { http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '@/app/app'
import { appRouter } from '@/app/app-router'
import { AppProviders } from '@/app/providers/app-providers'
import { okJson } from '@/test/msw/envelope'
import { createAuthTokenResponse } from '@/test/msw/factories'
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
 * `React.lazy` resolves from the module cache and the assertion below measures
 * the gallery's RENDER instead of the bundler's transform speed. The route is
 * still lazy and still rendered through the real router — only the cost of
 * building the chunk moves.
 *
 * Measured (30-way CPU contention): the gallery assertion 5038 ms and FAILING
 * without this import, 2596 ms and passing with it, on the same load.
 */
import '@/app/gallery/gallery-page'

const API_BASE_URL = '/api/v1'

/**
 * WHY THIS FILE CARRIES ITS OWN ASYNC-ASSERTION BUDGET
 * -----------------------------------------------------
 *
 * The route this file drives is served by a LAZY page, so its assertion waits
 * for a module graph to be transformed, evaluated and rendered before the
 * element it looks for exists. RTL's DEFAULT 1000 ms `findBy*` / `waitFor`
 * budget is what bounds that wait, and under full-suite parallel load
 * (300+ files, 15 workers on 16 logical CPUs) the CPU-bound transform and
 * render are served late enough to exhaust it — the assertion then fails on a
 * page that renders correctly a moment later.
 *
 * Vitest's own `testTimeout` (20 s, `vite.config.ts`) is a DIFFERENT budget and
 * never applies to an RTL assertion, so no global timeout override can fix
 * this: the budget has to be scoped to the file, exactly as it is in
 * `app-router.test.tsx`, `user-detail-page.test.tsx` and
 * `asset-disposal-form-page.test.tsx`.
 *
 * The budget is scoped to THIS FILE and restored afterwards; no global override
 * is added and no assertion is relaxed — a wrong element still fails, it just
 * fails after the lazy chunk has had time to land. 10 s leaves room for the
 * slowest measured lazy render (3216 ms under 30-way CPU contention) and still
 * fits inside the file's own 20 s test budget.
 */
const ASYNC_ASSERTION_TIMEOUT = 10_000

const defaultAsyncUtilTimeout = getConfig().asyncUtilTimeout
beforeAll(() => configure({ asyncUtilTimeout: ASYNC_ASSERTION_TIMEOUT }))
afterAll(() => configure({ asyncUtilTimeout: defaultAsyncUtilTimeout }))

/**
 * `App` owns `useSessionHydration`, so mounting it fires the real credentialed
 * `POST /auth/refresh`. Without a handler MSW fails the request, the adapter
 * publishes `session-expired`, and the mounted `AuthSessionExpiredBridge`
 * correctly returns the user to `/login` — so these cases now need a session
 * they actually have, rather than an unhandled request they silently relied on.
 */
beforeEach(() => {
  server.use(http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(createAuthTokenResponse())))
})

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  )
}

describe('App entry', () => {
  it('mounts the router and renders the app frame', async () => {
    renderApp()

    act(() => {
      appRouter.navigate('/dev/gallery')
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'معرض المكونات المشتركة' }),
    ).toBeInTheDocument()
  })

  it('returns the not-found page for an unlisted URL', async () => {
    renderApp()

    act(() => {
      appRouter.navigate('/unlisted/unwired')
    })

    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
  })

  it('cleans up rendered trees between tests', () => {
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
