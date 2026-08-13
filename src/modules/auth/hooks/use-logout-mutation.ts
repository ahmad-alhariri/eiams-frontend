import { useMutation } from '@tanstack/react-query'

import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'

/** Revokes the server session when possible and always clears local auth data. */
export function useLogoutMutation() {
  return useMutation({ mutationFn: authSessionLifecycle.logout })
}
