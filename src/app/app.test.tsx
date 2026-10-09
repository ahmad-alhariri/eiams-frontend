import { act, render, screen } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/app/app'
import { appRouter } from '@/app/app-router'
import { AppProviders } from '@/app/providers/app-providers'
import { okJson } from '@/test/msw/envelope'
import { createAuthTokenResponse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

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
      await screen.findByRole(
        'heading',
        { level: 1, name: 'معرض المكونات المشتركة' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('returns the not-found page for an unlisted URL', async () => {
    renderApp()

    act(() => {
      appRouter.navigate('/unlisted/unwired')
    })

    expect(
      await screen.findByRole('heading', { name: 'الصفحة غير موجودة' }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('cleans up rendered trees between tests', () => {
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
