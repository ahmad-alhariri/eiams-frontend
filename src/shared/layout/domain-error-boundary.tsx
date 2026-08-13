import type { ReactNode } from 'react'
import { useLocation } from 'react-router'

import { ErrorBoundary } from '@/shared/feedback/error-boundary'
import { ErrorState } from '@/shared/feedback/error-state'
import { Button } from '@/shared/ui/button'

type DomainErrorBoundaryProps = {
  children: ReactNode
}

/**
 * Per-route (per-domain) error boundary for lazy page elements (e05-t07).
 * The boundary is keyed by location.key, so navigating to another route
 * remounts it and clears a stuck error — one broken page never blanks the
 * whole shell. Fallback speaks the same Arabic as ErrorState with a retry
 * action (role=alert, ui-design.md 9.3).
 *
 * Note: after a failed chunk import, retrying re-attempts the same rejected
 * lazy promise; a reload remains the fallback for chunk errors. Render-time
 * errors recover immediately.
 */
function DomainErrorBoundary({ children }: DomainErrorBoundaryProps) {
  const location = useLocation()

  return (
    <div data-slot="domain-error-boundary">
      <ErrorBoundary
        key={location.key}
        fallback={(error, resetErrorBoundary) => (
          <ErrorState
            title="تعذر عرض الصفحة"
            description={error.message || 'حدث خطأ غير متوقع أثناء عرض هذه الصفحة.'}
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
    </div>
  )
}

export { DomainErrorBoundary, type DomainErrorBoundaryProps }
