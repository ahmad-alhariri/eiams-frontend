import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ErrorBoundary } from '@/shared/feedback/error-boundary'
import { queryClient } from '@/shared/services/query.client'
import { Toaster } from '@/shared/ui/toaster'

/**
 * Application-wide providers, composed once in src/main.tsx (e05-t01).
 *
 * Order matters:
 * - ErrorBoundary captures render/route errors at the root and offers retry.
 * - QueryClientProvider owns all server state; features never create clients.
 * - Toaster mounts the toast surface (Base UI provider) so the imperative
 *   `toast` facade and `useToast` work from anywhere.
 *
 * RTL is fixed at the document level (index.html dir="rtl"), and routing is
 * provided by the AppRouter that this wraps — providers do not create routes.
 */
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster />
        {children}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export { AppProviders }
