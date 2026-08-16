import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/app/app'
import { BootstrapFailureScreen } from '@/app/pages/bootstrap-failure-screen'
import { AppProviders } from '@/app/providers/app-providers'
import { environment } from '@/config/env'

/**
 * Application bootstrap.
 *
 * Development-only API mocks (MSW browser worker) start first when the
 * validated environment enables them (`VITE_ENABLE_API_MOCKS` defaults to
 * `true` in dev). The dynamic import inside `startDevMocks` keeps the mock
 * layer out of production bundles.
 *
 * Every failure path is handled: a mock-worker startup error (missing worker
 * file, activation timeout) or a missing root element renders a dependency-free
 * Arabic failure screen with a reload action instead of an unhandled promise
 * rejection and a blank page.
 */

export interface BootstrapApplicationOptions {
  /** Test-only override for the MSW worker start. */
  startMocks?: () => Promise<void>
  /** Test-only override for mounting the application tree. */
  renderApp?: (rootElement: Element) => void
}

const defaultStartMocks = async (): Promise<void> => {
  const { mockWorker } = await import('@/mocks/browser')
  await mockWorker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
  })
}

const defaultRenderApp = (rootElement: Element): void => {
  createRoot(rootElement).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  )
}

function renderFailureScreen(rootElement: Element, error: unknown): void {
  createRoot(rootElement).render(
    <StrictMode>
      <BootstrapFailureScreen error={error} />
    </StrictMode>,
  )
}

/** Never rejects: every startup failure is contained and surfaced visibly. */
export async function bootstrapApplication(
  options: BootstrapApplicationOptions = {},
): Promise<void> {
  const { startMocks = defaultStartMocks, renderApp = defaultRenderApp } = options

  const rootElement = document.getElementById('root')
  if (rootElement === null) {
    console.error('[bootstrap] Root element #root was not found.')
    return
  }

  try {
    if (environment.isDevelopment && environment.enableApiMocks) {
      await startMocks()
    }
    renderApp(rootElement)
  } catch (error: unknown) {
    console.error('[bootstrap] The application failed to start.', error)
    renderFailureScreen(rootElement, error)
  }
}
