import type { ReactNode } from 'react'

import { ErrorBoundary } from '@/shared/feedback/error-boundary'
import { Button } from '@/shared/ui/button'

/**
 * Per-region error boundary for the persistent app-shell chrome (header,
 * sidebar). Unlike the route-level boundary, it is deliberately NOT keyed by
 * location: chrome must keep its state across navigations, so a crashed
 * region stays collapsed into a compact Arabic fallback bar with a retry
 * action until the user recovers it or reloads the page. The page content
 * and the unaffected regions keep working.
 */
type AppChromeBoundaryProps = {
  /** Region label shown in the Arabic fallback, e.g. "الشريط العلوي". */
  label: string
  children: ReactNode
}

function AppChromeBoundary({ label, children }: AppChromeBoundaryProps) {
  return (
    <ErrorBoundary
      onError={(error) => {
        console.error(`[chrome] Failed to render the ${label} region.`, error)
      }}
      fallback={(error, resetErrorBoundary) => (
        <section
          data-slot="chrome-error-fallback"
          role="alert"
          aria-label={label}
          className="flex min-h-12 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          <span className="min-w-0 truncate">
            تعذر عرض {label}.
            {error.message ? <span className="text-destructive/70"> {error.message}</span> : null}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            إعادة المحاولة
          </Button>
        </section>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

export { AppChromeBoundary, type AppChromeBoundaryProps }
