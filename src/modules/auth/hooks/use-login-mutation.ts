import { useMutation } from '@tanstack/react-query'

import { authService } from '@/modules/auth/services/auth.service'
import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'

/**
 * Owns the server mutation boundary for an interactive login attempt.
 *
 * The returned token response is deliberately handed straight to the session
 * lifecycle store; session data itself stays at the API/query boundary.
 */
export function useLoginMutation() {
  return useMutation({
    mutationFn: authService.login,
    onSuccess: authSessionLifecycle.installLogin,
    // Login variables contain a password. The page resets its observer after
    // settlement, and this prevents an unobserved mutation from retaining the
    // credentials in TanStack Query's mutation cache.
    gcTime: 0,
  })
}
