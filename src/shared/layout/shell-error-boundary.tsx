import type { ReactNode } from 'react'

import { ErrorBoundary } from '@/shared/feedback/error-boundary'
import { ErrorState } from '@/shared/feedback/error-state'
import { Button } from '@/shared/ui/button'

type ShellErrorBoundaryProps = {
  children: ReactNode
}

/**
 * Boundary for the app-shell wrappers that sit OUTSIDE the per-route
 * `DomainErrorBoundary` (`src/config/route-registry.tsx`).
 *
 * `AppLayout`, `RequireActiveScope`, `RouteAccessGuard` and
 * `AuthSessionExpiredBridge` are mounted at the router level, so before this
 * boundary a render failure in any of them unwound all the way to the ROOT
 * `ErrorBoundary` (`src/app/providers/app-providers.tsx`) and replaced the
 * WHOLE application — nav, sidebar and page — with a full-page fallback.
 *
 * This boundary keeps the failure where it happened: the shell renders a
 * compact Arabic `ErrorState` with a retry action IN PLACE, and the root
 * boundary stays the last-resort catch for a fatal error in the boundary
 * itself.
 *
 * It is deliberately NOT keyed by location: the failure is in the frame, not
 * in a route, so navigating away cannot repair it and the retry action is the
 * honest way out.
 */
function ShellErrorBoundary({ children }: ShellErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(_error, resetErrorBoundary) => (
        <ErrorState
          className="m-4"
          title="تعذر عرض التطبيق"
          description="حدث خطأ غير متوقع أثناء عرض واجهة التطبيق. حاول مرة أخرى."
          action={
            <Button type="button" variant="outline" onClick={resetErrorBoundary}>
              إعادة المحاولة
            </Button>
          }
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

export { ShellErrorBoundary, type ShellErrorBoundaryProps }
