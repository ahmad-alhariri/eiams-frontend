import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppEnvironment } from '@/config/env'

/**
 * The profile as `@/config/env` reports it, plus the raw flag behind it. Both are
 * varied on purpose: a marker that re-derived the profile from the flag — or from
 * `import.meta.env` — answers the opposite way on the contradictory case below.
 */
type Profile = Pick<AppEnvironment, 'uiSandbox' | 'authBypass'>

const LOGIN_HEADING = 'نظام إدارة المخزون والأصول'

/**
 * Renders the REAL router at `/login` under a chosen profile.
 *
 * `public: true` routes are composed in `@/app/app-router` without the
 * `AppLayout` frame, which is why they need the RESOLUTION-040 marker mounted
 * separately — and why the assertion has to drive the real router rather than a
 * hand-built one, or it would only prove that a test's own copy of the
 * composition works.
 *
 * Every module is imported AFTER `vi.doMock` so the whole router graph (the
 * session store and query client included) binds the mocked profile; a
 * statically imported sibling would be a different instance from the one the
 * guards read.
 */
async function renderAnonymousRoute(profile: Profile) {
  vi.resetModules()
  vi.doMock('@/config/env', async () => {
    const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env')

    return {
      ...actual,
      environment: Object.freeze({ ...actual.environment, ...profile }) as AppEnvironment,
    }
  })

  const [{ AppProviders }, { AppRouter, appRouter }, { useAuthSessionStore }] = await Promise.all([
    import('@/app/providers/app-providers'),
    import('@/app/app-router'),
    import('@/modules/auth/store/auth-session.store'),
  ])

  // The anonymous surface is what an unauthenticated developer reaches first.
  act(() => {
    useAuthSessionStore.setState({ status: 'unauthenticated' })
  })

  render(
    <AppProviders>
      <AppRouter />
    </AppProviders>,
  )

  await act(async () => {
    await appRouter.navigate('/login')
  })

  expect(appRouter.state.location.pathname).toBe('/login')
}

afterEach(() => {
  vi.doUnmock('@/config/env')
  vi.resetModules()
})

describe('sandbox marker on the anonymous route (RESOLUTION-040)', () => {
  it('marks the login surface when the sandbox profile is active', async () => {
    await renderAnonymousRoute({ uiSandbox: true, authBypass: true })

    expect(await screen.findByRole('heading', { name: LOGIN_HEADING })).toBeInTheDocument()

    const notice = screen.getByRole('status')

    expect(notice).toHaveTextContent('بيئة الاختبار')
    expect(notice).toHaveTextContent('جلسة تجريبية')
    expect(notice).toHaveAttribute('aria-live', 'polite')
  })

  it('marks the login surface whenever environment.uiSandbox is on, flag or no flag', async () => {
    // uiSandbox on, authBypass off. The validated profile is the answer, so a
    // shell that re-derived it from the flag would leave this page unmarked.
    await renderAnonymousRoute({ uiSandbox: true, authBypass: false })

    expect(await screen.findByRole('heading', { name: LOGIN_HEADING })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('بيئة الاختبار')
  })

  it('renders no marker on the login surface under the real-backend profile', async () => {
    await renderAnonymousRoute({ uiSandbox: false, authBypass: false })

    expect(await screen.findByRole('heading', { name: LOGIN_HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders no marker on the login surface when only a raw flag claims the sandbox', async () => {
    // The false-evidence direction: marking a real-backend session as fixture
    // data is exactly what RESOLUTION-040 forbids.
    await renderAnonymousRoute({ uiSandbox: false, authBypass: true })

    expect(await screen.findByRole('heading', { name: LOGIN_HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
