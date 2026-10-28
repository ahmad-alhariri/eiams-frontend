/** Contract-smoke origin — proxy through Vite dev server (origin 5188). */
export const CONTRACT_ORIGIN = 'http://127.0.0.1:5188' as const
export const CONTRACT_DEV_PORT = 5188
/**
 * The backend the suite talks to. The Vite dev server proxies `/api/v1` to it.
 *
 * `EIAMS_DEV_PROXY_TARGET` overrides the default so CI can point the suite at
 * the backend container it started, and so a second backend can be exercised
 * without editing source. Never `localhost`: the backend compares the request
 * `Origin` against its own `{Scheme}://{Host}`, so the two are different hosts
 * to it.
 */
export const CONTRACT_PROXY_TARGET =
  process.env['EIAMS_DEV_PROXY_TARGET'] ?? 'http://127.0.0.1:5000'
export const CONTRACT_BACKEND_HEALTH = 'http://127.0.0.1:5188/api/v1/health/ready' as const
export const CONTRACT_BACKEND_SWAGGER = `${CONTRACT_PROXY_TARGET}/swagger/v1/swagger.json`
