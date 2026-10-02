import { Outlet } from 'react-router'
import type { ReactNode } from 'react'

import { AppChromeBoundary } from '@/shared/layout/app-chrome-boundary'
import { Sidebar } from '@/shared/layout/sidebar/sidebar'
import { AppHeader } from '@/shared/layout/header/app-header'
import { Breadcrumbs } from '@/shared/layout/header/breadcrumb'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import { UiSandboxMarker } from '@/shared/layout/ui-sandbox-marker'
import type { HasPermission } from '@/shared/layout/sidebar/sidebar-nav-model'

/**
 * Responsive RTL app frame (ui-design.md 4.1): forest header bar on top, the
 * forest sidebar on the inline-end (right) side, ivory main content, footer.
 * The header chrome (brand, bell, user block) and the sidebar render
 * immediately; lazy page chunks suspend under the main Suspense boundary.
 * Session-driven chrome is injected by the router (`userMenu`) so the frame
 * itself never reads session state.
 *
 * The sandbox notice is the one exception: RESOLUTION-040 requires a
 * fixture-backed session to be visibly marked, and it must be unmissable above
 * the header rather than buried in a page. `UiSandboxMarker` is the single mount
 * point shared with the anonymous routes — it, not this frame, reads the
 * validated profile.
 */
type AppLayoutProps = {
  /** Test-only override; production navigation reads the hydrated session. */
  hasPermission?: HasPermission | undefined
  userMenu?: ReactNode
}

function AppLayout({ hasPermission, userMenu }: AppLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col bg-ivory text-foreground" dir="rtl">
      <UiSandboxMarker>
        <AppChromeBoundary label="الشريط العلوي">
          <AppHeader breadcrumb={<Breadcrumbs />} userMenu={userMenu} />
        </AppChromeBoundary>
        <div className="flex flex-1 items-stretch">
          <AppChromeBoundary label="القائمة الجانبية">
            <Sidebar hasPermission={hasPermission} />
          </AppChromeBoundary>
          <main
            data-slot="app-main"
            className="min-w-0 flex-1 px-4 py-8 md:px-6 lg:px-8"
            aria-label="محتوى الصفحة"
          >
            <RouteSuspense>
              <Outlet />
            </RouteSuspense>
          </main>
        </div>
        <footer className="px-4 py-3 text-center text-xs text-stone" data-slot="app-footer">
          نظام إدارة المخزون والأصول المؤسسي — الهيئة العامة للرقابة والتفتيش
        </footer>
      </UiSandboxMarker>
    </div>
  )
}

export { AppLayout }
