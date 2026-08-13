import type { HttpHandler } from 'msw'

/**
 * Baseline MSW handler registry.
 *
 * Contract-derived per-endpoint handlers and factories are owned by
 * eiams-frontend-e08-t09. Until they land, feature tests register their own
 * handlers inline via `server.use(...)`.
 */
export const handlers: readonly HttpHandler[] = []
