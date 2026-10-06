/**
 * Development-only Vite API proxy.
 *
 * The dev server proxies the configured origin-relative API path (default
 * `/api/v1`) to a locally running EIAMS backend. The browser always talks to
 * the same origin, so the host-only refresh cookie works without CORS. The
 * proxy is never part of the production build, and its target comes from
 * `EIAMS_DEV_PROXY_TARGET` — deliberately not `VITE_*`-prefixed so the backend
 * origin never reaches browser code.
 *
 * This module must not import `@/config/env`: that module executes
 * `parseEnvironment(import.meta.env)` at import time, which has no value in
 * Vite's Node configuration context.
 */

export const DEFAULT_DEV_API_PROXY_TARGET = 'http://localhost:5000'

export const DEFAULT_API_BASE_URL = '/api/v1'

export interface DevApiProxyConfig {
  /** Origin-relative API path prefix, e.g. `/api/v1`. */
  context: string
  /** Backend origin the dev server forwards API requests to. */
  target: string
  /**
   * Must stay `false`.
   *
   * `changeOrigin: true` rewrites the forwarded `Host` header to the proxy target,
   * so the backend receives `Host: localhost:5000` while the browser's truthful
   * `Origin` stays `http://localhost:5173`. The backend's refresh-cookie origin
   * check compares `Origin` against its OWN `{Scheme}://{Host}`
   * (`RefreshTokenTransport.IsCookieOriginAllowed`), so a rewritten host can never
   * match a same-origin browser request and every cookie-authenticated call is
   * refused with 403 `REFRESH_TOKEN_ORIGIN_REJECTED`.
   *
   * That check is the CSRF defence for the host-only refresh cookie, so it is not
   * weakened here: forwarding the original `Host` lets the backend see the real
   * browser origin and validate it truthfully, which is what its own startup
   * message asks for ("Serve browser API requests through the UI's same-origin
   * /api/v1 proxy"). The backend routes by path, not by host, so nothing needs the
   * rewritten value.
   */
  changeOrigin: false
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const baseUrl = value?.trim() || DEFAULT_API_BASE_URL

  if (baseUrl === '/') {
    return null
  }

  const normalized = baseUrl.replace(/\/+$/u, '')

  const isUsableOriginRelativePath =
    normalized.startsWith('/') &&
    !normalized.startsWith('//') &&
    !normalized.includes('\\') &&
    !normalized.includes('?') &&
    !normalized.includes('#') &&
    !/\s/u.test(normalized)

  return isUsableOriginRelativePath ? normalized : null
}

/**
 * Resolves the dev-server proxy from the Vite environment. Returns `null`
 * when no API path can be proxied safely (whole-origin base URL, or a base
 * URL that is not an origin-relative path — the application's own environment
 * validation reports the misconfiguration on startup).
 */
export function resolveDevApiProxy(
  env: Record<string, string | undefined>,
): DevApiProxyConfig | null {
  const context = normalizeBaseUrl(env['VITE_API_BASE_URL'])
  if (context === null) {
    return null
  }

  const target = env['EIAMS_DEV_PROXY_TARGET']?.trim() || DEFAULT_DEV_API_PROXY_TARGET

  // Not frozen: Vite's http-proxy patches the options object at startup
  // (prependPath), so the config must stay extensible.
  return { context, target, changeOrigin: false } as const
}
