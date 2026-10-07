import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppEnvironment } from '@/config/env'

/**
 * The profile the validated environment reports, and the raw flag it was derived
 * from. Mocking `@/config/env` and varying BOTH is the point: a marker that
 * re-derived the profile from `environment.authBypass` — or read
 * `import.meta.env.VITE_AUTH_BYPASS` directly — answers the opposite way on the
 * two contradictory profiles below. The suite therefore fails loudly if the
 * marker stops reading the validated flag, instead of drifting silently toward
 * a second source of truth (`eiams-frontend-do3b`).
 */
type Profile = Pick<AppEnvironment, 'uiSandbox' | 'authBypass'>

async function renderMarker(profile: Profile) {
  vi.resetModules()
  vi.doMock('@/config/env', async () => {
    const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env')

    return {
      ...actual,
      environment: Object.freeze({ ...actual.environment, ...profile }) as AppEnvironment,
    }
  })

  // Imported after the mock is registered so the marker binds the mocked profile.
  const { UiSandboxMarker } = await import('@/shared/layout/ui-sandbox-marker')

  return render(
    <UiSandboxMarker>
      <div data-testid="surface">محتوى الصفحة</div>
    </UiSandboxMarker>,
  )
}

afterEach(() => {
  vi.doUnmock('@/config/env')
  vi.resetModules()
})

describe('UiSandboxMarker', () => {
  it('marks the surface when the sandbox profile is active', async () => {
    await renderMarker({ uiSandbox: true, authBypass: true })

    const notice = screen.getByRole('status')

    expect(notice).toHaveTextContent('بيئة الاختبار')
    expect(notice).toHaveTextContent('البيانات لا تأتي من الخادم الحقيقي')
    expect(notice).toHaveTextContent('جلسة تجريبية')
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByTestId('surface')).toBeInTheDocument()
  })

  it('renders nothing but still keeps the surface under the real-backend profile', async () => {
    await renderMarker({ uiSandbox: false, authBypass: false })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('surface')).toBeInTheDocument()
  })

  it('follows environment.uiSandbox when the raw auth-bypass flag says otherwise', async () => {
    // uiSandbox on, authBypass off: the validated, frozen profile is the answer,
    // so a marker reading the flag instead of the profile renders nothing here.
    await renderMarker({ uiSandbox: true, authBypass: false })

    expect(screen.getByRole('status')).toHaveTextContent('بيئة الاختبار')
  })

  it('stays silent when environment.uiSandbox is off even if a raw flag says on', async () => {
    // The mirror image, and the one that matters most: a marker that re-derived
    // the profile from the flag would mark a real-backend session as fixture
    // evidence, which is the false-evidence failure RESOLUTION-040 forbids.
    await renderMarker({ uiSandbox: false, authBypass: true })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('wraps the surface without adding a box of its own', async () => {
    await renderMarker({ uiSandbox: true, authBypass: true })

    // The wrapper renders a fragment, so the notice sits beside the surface and
    // neither gains a layout box from the mount point.
    expect(screen.getByRole('status').parentElement).toBe(
      screen.getByTestId('surface').parentElement,
    )
    expect(document.querySelectorAll('[data-slot="ui-sandbox-notice"]')).toHaveLength(1)
  })
})
