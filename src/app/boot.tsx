import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/app/app'
import { BootstrapFailureScreen } from '@/app/pages/bootstrap-failure-screen'
import { AppProviders } from '@/app/providers/app-providers'

/**
 * Application bootstrap.
 *
 * Present state: there is nothing to start before the app renders.
 *
 * History, kept because it is load-bearing. This file used to start a
 * development-only MSW browser worker before rendering, behind
 * `DEV_ONLY_START_MOCKS` and `environment.enableApiMocks`. The mock layer it
 * imported (`src/mocks/`) is deleted as of `eiams-frontend-m4jm` (EPIC G7), and
 * `VITE_ENABLE_API_MOCKS` is retired with it. `src/test/msw/` survives and is
 * test-only — Vitest boots it directly, and nothing in `src/app/` imports it.
 *
 * Two lessons from the deleted code are recorded here because the next person to
 * add a "dev-only" bootstrap step will otherwise rediscover them the expensive
 * way:
 *
 * 1. **A runtime `isDevelopment` check is not a build-time switch.** Only
 *    `import.meta.env.DEV` is substituted at build time. The deleted code kept
 *    the dynamic `import('@/mocks/browser')` behind that ternary and, because
 *    nothing statically referenced the closure, Rollup dropped the branch and the
 *    mock chunk was never emitted. An earlier version used a destructuring
 *    default (`const { startMocks = defaultStartMocks } = options`), which
 *    references the mock module on every call path — so the bundler had to keep
 *    the chunk no matter what the branch evaluated to, and a 517 kB MSW chunk
 *    shipped to production while the code read as "dev only".
 * 2. **Do not import a fixture-capable module from the app at all.** Pruning is
 *    a second line of defence. `src/test/no-runtime-test-imports.test.ts`
 *    enforces that no file outside `src/test/` imports `@/test/**`, and
 *    `src/test/production-artifact-purity.test.ts` builds for real and reads the
 *    emitted bytes, failing on any chunk containing `setupWorker` or a seed
 *    value from the deleted `src/mocks/db.ts`. Both still pass.
 *
 * Every failure path is still handled: a render/mount failure or a missing root
 * element renders a dependency-free Arabic failure screen with a reload action
 * instead of an unhandled promise rejection and a blank page.
 */

export interface BootstrapApplicationOptions {
  /** Test-only override for mounting the application tree. */
  renderApp?: (rootElement: Element) => void
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
  const renderApp = options.renderApp ?? defaultRenderApp

  const rootElement = document.getElementById('root')
  if (rootElement === null) {
    console.error('[bootstrap] Root element #root was not found.')
    return
  }

  try {
    renderApp(rootElement)
  } catch (error: unknown) {
    console.error('[bootstrap] The application failed to start.', error)
    renderFailureScreen(rootElement, error)
  }
}
