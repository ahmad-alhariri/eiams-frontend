import { render, screen } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import {
  authSessionQueryKey,
  hasRememberedSession,
  rememberSession,
} from '@/modules/auth/services/session-lifecycle'
import { errJson, okJson } from '@/test/msw/envelope'
import { createAuthTokenResponse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { stubLocalStorage } from '@/test/support/memory-storage'

const API_BASE_URL = '/api/v1'

/**
 * The application root owns the session bootstrap, so the APPLICATION is what
 * has to be rendered to see whether the browser asks the server for a refresh.
 *
 * The router is built at module scope from `window.location`, so every case
 * resets the module registry and imports the application again at its own
 * path: the location a fresh browser context opens with is exactly what the
 * bootstrap reads.
 */
async function renderAppAt(path: string) {
  window.history.replaceState({}, '', path)
  vi.resetModules()
  const [{ default: App }, { AppProviders }] = await Promise.all([
    import('@/app/app'),
    import('@/app/providers/app-providers'),
  ])

  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  )
}

/**
 * Counts the refresh-cookie requests the browser makes.
 *
 * The answer is supplied per case: a browser without a refresh cookie gets
 * 400 USERS_INVALID_REFRESH_TOKEN from the server, while a browser that still
 * holds one gets a session.
 */
function countRefreshRequests(respond: () => Response): () => number {
  let calls = 0
  server.use(
    http.post(`${API_BASE_URL}/auth/refresh`, () => {
      calls += 1
      return respond()
    }),
  )

  return () => calls
}

const invalidRefresh = () =>
  errJson(400, {
    code: 'USERS_INVALID_REFRESH_TOKEN',
    message: 'The refresh token is invalid.',
    details: {},
  })

beforeEach(() => {
  // Each case is a browser context of its own: the "signed in before" hint is
  // part of that context, so it must not leak between cases.
  stubLocalStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useSessionHydration', () => {
  it('asks the server for no refresh on the public login route', async () => {
    const refreshCalls = countRefreshRequests(invalidRefresh)

    await renderAppAt(ROUTE_PATHS.login)

    // The public login route resolves as "not signed in" and stays usable.
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
    expect(document.cookie).toBe('')
    expect(refreshCalls()).toBe(0)
  })

  it('asks the server for no refresh on a fresh browser opening the root path', async () => {
    const refreshCalls = countRefreshRequests(invalidRefresh)

    // A fresh context holds no refresh cookie and no "signed in before" hint,
    // so the root path resolves as "not signed in" without a failing request.
    await renderAppAt(ROUTE_PATHS.dashboard)

    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(0)
  })

  it('restores a remembered session on the root path after login', async () => {
    const refreshCalls = countRefreshRequests(() => okJson(createAuthTokenResponse()))
    rememberSession()

    await renderAppAt(ROUTE_PATHS.dashboard)

    // The protected root renders its page instead of bouncing back to login.
    expect(await screen.findByRole('heading', { name: 'لوحة المعلومات' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(1)
  })

  it('still hydrates the session on a protected route', async () => {
    const refreshCalls = countRefreshRequests(() => okJson(createAuthTokenResponse()))
    rememberSession()

    await renderAppAt(ROUTE_PATHS.profile)

    // The protected route leaves the session-check boundary once the refresh
    // installed the session the server answered with.
    expect(await screen.findByRole('heading', { name: 'الملف الشخصي' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(1)
  })

  it('treats an invalid refresh as "no session" without retrying or logging an error', async () => {
    const refreshCalls = countRefreshRequests(invalidRefresh)
    rememberSession()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const firstLoad = await renderAppAt(ROUTE_PATHS.dashboard)

    // One attempt proves the hint is only a hint; the login surface is the
    // "no session" outcome, and dropping the hint keeps the next load quiet.
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(1)
    expect(hasRememberedSession()).toBe(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // The bootstrap resolved as "no session": nothing was logged, and the query
    // is absent or idle, never an error an observer would refetch on remount.
    const { queryClient } = await import('@/shared/services/query.client')
    expect(queryClient.getQueryState(authSessionQueryKey)?.status).not.toBe('error')
    expect(consoleError).not.toHaveBeenCalled()

    firstLoad.unmount()

    // The next page load in the same browser makes no request at all.
    await renderAppAt(ROUTE_PATHS.dashboard)
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(1)
  })
})
