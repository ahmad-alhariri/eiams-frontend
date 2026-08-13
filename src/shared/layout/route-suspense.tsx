import { Suspense, type ReactNode } from 'react'

import { FullPageSpinner } from '@/shared/feedback/full-page-spinner'

type RouteSuspenseProps = {
  children: ReactNode
  label?: string
}

/**
 * Suspense wrapper for lazy route chunks (e05-t07). Shows the shared
 * FullPageSpinner until the chunk resolves; the fallback carries its own
 * data-slot so tests and QA can assert the loading state without probing
 * internals. Used by the AppLayout frame around the routed Outlet.
 */
function RouteSuspense({ children, label = 'جارٍ تحميل الصفحة...' }: RouteSuspenseProps) {
  return (
    <Suspense
      fallback={
        <div data-slot="route-suspense-fallback">
          <FullPageSpinner label={label} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export { RouteSuspense, type RouteSuspenseProps }
