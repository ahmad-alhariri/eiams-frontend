import { authService } from '@/modules/auth/services/auth.service'
import { createActiveScopeContext } from '@/modules/auth/services/active-scope-context'
import { queryClient } from '@/shared/services/query.client'

/** Application singleton for the query-backed, serialized active-scope transition. */
export const activeScopeContext = createActiveScopeContext({ authService, queryClient })
