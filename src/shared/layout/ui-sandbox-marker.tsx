import type { ReactNode } from 'react'

import { environment } from '@/config/env'
import { UiSandboxNotice, type UiSandboxFixture } from '@/shared/ui/ui-sandbox-notice'

/**
 * Active development fixtures, read from the validated profile.
 *
 * WHY THIS LIST LIVES HERE AND NOWHERE ELSE: `@/config/env` owns the sandbox
 * decision. It validates the raw flags, refuses a production build that carries
 * a fixture, and freezes the answer into `environment.uiSandbox`. Everything
 * downstream must READ that answer. Re-deriving it here from raw flags (or from
 * `import.meta.env`) would create a second, weaker source of truth that can
 * drift from the one the app actually booted with — which is precisely the
 * false-evidence failure RESOLUTION-040 exists to prevent, so
 * `eiams-frontend-do3b` filed this as a defect.
 *
 * `authBypass` is the only fixture left. The `'mocks'` entry it used to be able
 * to contribute came from `environment.enableApiMocks`, retired with
 * `src/mocks/` in `eiams-frontend-m4jm`; `@/shared/ui/ui-sandbox-notice` still
 * accepts it so the marker keeps its two-fixture vocabulary, but nothing in the
 * app can pass it now.
 */
const SANDBOX_FIXTURES: readonly UiSandboxFixture[] = environment.uiSandbox
  ? (['authBypass'] as const)
  : []

type UiSandboxMarkerProps = {
  children?: ReactNode
}

/**
 * Mounts the RESOLUTION-040 marker above a surface, on every surface that can
 * show a fixture-backed session.
 *
 * `AppLayout` marks the authenticated, dev-gallery and not-found branches. The
 * login branch has no frame at all, and login is where a developer running the
 * sandbox lands first — an unmarked login page reads as integration evidence.
 * Both mount points share this one wrapper, so there is one element and one
 * profile read rather than two of each.
 *
 * `children` is optional so a caller can wrap a surface or place the marker
 * inline above one. The wrapper renders a fragment, so it adds no DOM box.
 */
function UiSandboxMarker({ children }: UiSandboxMarkerProps) {
  return (
    <>
      <UiSandboxNotice fixtures={SANDBOX_FIXTURES} />
      {children}
    </>
  )
}

export { UiSandboxMarker }
