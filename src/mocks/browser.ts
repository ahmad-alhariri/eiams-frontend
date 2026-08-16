import { setupWorker } from 'msw/browser'

import { mockApiHandlers } from '@/mocks/handlers'

/**
 * Development mocks via the MSW browser worker.
 *
 * Only started when the app runs in development with `VITE_ENABLE_API_MOCKS`
 * unset (or not `"false"`); production builds never import this module (the
 * caller uses a dynamic import inside a pruned dev branch).
 */
export const mockWorker = setupWorker(...mockApiHandlers)
