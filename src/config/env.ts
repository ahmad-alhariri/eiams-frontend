import { z } from 'zod'

const defaultApiBaseUrl = '/api/v1'

/**
 * Validate an origin-relative API path (the production-style base URL).
 *
 * The result must start with `/`, must NOT start with `//` (which browsers
 * resolve as a protocol-relative URL and so leaks the host), must not contain
 * a `?` or `#` (the base URL is concatenated with relative paths), and must
 * not contain a backslash or whitespace.
 */
function isSafeOriginRelativePath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('?') &&
    !value.includes('#') &&
    !/\s/.test(value)
  )
}

/**
 * Validate a dev-localhost absolute URL (`http://localhost:*` or
 * `http://127.0.0.1:*`). Used by the cross-origin dev topology described in
 * `docs/direct-backend-integration-plan.md §5.1`.
 *
 * Rejects embedded credentials, query strings, fragments, non-local hosts,
 * and any non-HTTP scheme (including `https://` — production HTTPS must go
 * through the same-origin path-style validator instead so the host-only
 * refresh cookie keeps working without CORS).
 */
function isSafeDevLocalhostAbsoluteUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:') {
    return false
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return false
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return false
  }
  if (!isSafeOriginRelativePath(parsed.pathname)) {
    return false
  }
  return true
}

function buildApiBaseUrlSchema(isProduction: boolean) {
  return z
    .string()
    .trim()
    .min(1, 'VITE_API_BASE_URL must not be empty')
    .refine(
      (value) =>
        isProduction
          ? isSafeOriginRelativePath(value)
          : isSafeOriginRelativePath(value) || isSafeDevLocalhostAbsoluteUrl(value),
      {
        message: isProduction
          ? 'VITE_API_BASE_URL must be an origin-relative path without a query or fragment'
          : 'VITE_API_BASE_URL must be an origin-relative path or a http://localhost:* / http://127.0.0.1:* URL without credentials, query, or fragment',
      },
    )
    .transform((value) => {
      if (value === '/') {
        return value
      }
      // For dev-localhost absolute URLs, keep the trimmed origin + path
      // intact so the browser can address the cross-origin backend directly.
      if (!isProduction && isSafeDevLocalhostAbsoluteUrl(value)) {
        const parsed = new URL(value)
        return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/u, '')}`
      }
      return value.replace(/\/+$/, '')
    })
    .default(defaultApiBaseUrl)
}

const enableApiMocksSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

/**
 * EIAMS frontend environment configuration.
 *
 * `VITE_API_BASE_URL` accepts two shapes:
 *
 * - Origin-relative path (the production default and the recommended dev
 *   topology under the Vite dev proxy). The dev server forwards this path
 *   to the backend so the browser stays same-origin and the host-only
 *   refresh cookie works without CORS.
 * - Absolute `http://localhost:*` or `http://127.0.0.1:*` URL (cross-origin
 *   direct dev topology from `docs/direct-backend-integration-plan.md §5.1`).
 *   Only accepted when the build is NOT production, because production
 *   HTTPS must keep the host-only refresh cookie on the same origin.
 *
 * Embedded credentials, query strings, fragments, any non-local host, and
 * `http://` URLs in production are all rejected. The origin-relative path
 * validator is never relaxed.
 *
 * `VITE_ENABLE_API_MOCKS` defaults to `false` — `pnpm dev` now talks to the
 * real backend by default. MSW stays installed and is still used by
 * `src/test/msw/handlers.ts` for vitest; the dev-browser worker path
 * (dynamic-imported from `src/app/boot.tsx`) is reachable only when this
 * flag is explicitly set to `true`. Production bundles therefore never
 * contain the worker.
 *
 * The dev-only auth bypass (`VITE_AUTH_BYPASS`, default `true`, see
 * `src/shared/services/dev-session.ts`) is orthogonal to MSW and continues
 * to intercept `/auth/refresh` only — it is the developer-ergonomics shim
 * that lets you open a feature page without logging in, and it stays on by
 * default.
 */
function buildEnvironmentSchema(isProduction: boolean) {
  return z.object({
    VITE_API_BASE_URL: buildApiBaseUrlSchema(isProduction),
    VITE_ENABLE_API_MOCKS: enableApiMocksSchema,
    MODE: z.string().trim().min(1, 'MODE must not be empty'),
    DEV: z.boolean(),
    PROD: z.boolean(),
  })
}

export type AppEnvironment = Readonly<{
  apiBaseUrl: string
  enableApiMocks: boolean
  mode: string
  isDevelopment: boolean
  isProduction: boolean
}>

export function parseEnvironment(source: Record<string, unknown>): AppEnvironment {
  const isProduction = source['PROD'] === true
  const result = buildEnvironmentSchema(isProduction).safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid EIAMS frontend environment configuration: ${issues}`)
  }

  return Object.freeze({
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    enableApiMocks: result.data.VITE_ENABLE_API_MOCKS,
    mode: result.data.MODE,
    isDevelopment: result.data.DEV,
    isProduction: result.data.PROD,
  })
}

export const environment = parseEnvironment(import.meta.env)
