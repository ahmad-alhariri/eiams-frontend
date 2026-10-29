import { render, screen } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import { errJson, okJson } from '@/test/msw/envelope'
import { createAuthTokenResponse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

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

describe('useSessionHydration', () => {
  it('asks the server for no refresh on the public login route', async () => {
    const refreshCalls = countRefreshRequests(() =>
      errJson(400, {
        code: 'USERS_INVALID_REFRESH_TOKEN',
        message: 'The refresh token is invalid.',
        details: {},
      }),
    )

    await renderAppAt(ROUTE_PATHS.login)

    // The public login route resolves as "not signed in" and stays usable.
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
    expect(document.cookie).toBe('')
    expect(refreshCalls()).toBe(0)
  })

  it('still hydrates the session on a protected route', async () => {
    const refreshCalls = countRefreshRequests(() => okJson(createAuthTokenResponse()))

    await renderAppAt(ROUTE_PATHS.profile)

    // The protected route leaves the session-check boundary once the refresh
    // installed the session the server answered with.
    expect(await screen.findByRole('heading', { name: 'الملف الشخصي' })).toBeInTheDocument()
    expect(refreshCalls()).toBe(1)
  })
})
