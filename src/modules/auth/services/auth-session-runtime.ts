import { authService } from '@/modules/auth/services/auth.service'
import { createAuthSessionLifecycle } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { sessionAdapter } from '@/shared/services/api.client'
import { queryClient } from '@/shared/services/query.client'

/** Application singleton that composes the auth transport, lifecycle store, and query cache. */
export const authSessionLifecycle = createAuthSessionLifecycle({
  authService,
  queryClient,
  sessionAdapter,
  sessionStore: useAuthSessionStore,
})
