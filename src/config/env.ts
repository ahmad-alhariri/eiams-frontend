import { z } from 'zod'

/**
 * Development environment profiles (RESOLUTION-040, D-INT-02).
 *
 * Two mutually exclusive profiles exist, and real backend integration is the
 * default:
 *
 * | Profile      | `VITE_AUTH_BYPASS` | Evidence it produces                |
 * | ------------ | ------------------ | ----------------------------------- |
 * | real-backend | `false` (default)  | genuine integration                 |
 * | ui-sandbox   | `true`             | fixture session only, must be marked |
 *
 * `uiSandbox` reports whether the fixture is active so the shell can mark the
 * session, because a fixture-authenticated UI is not evidence of backend
 * integration.
 *
 * There was a second flag, `VITE_ENABLE_API_MOCKS`, backed by an MSW browser
 * worker in `src/mocks/`. It is gone: `eiams-frontend-m4jm` (EPIC G7) deleted
 * that directory, because a runtime mock layer reachable from the app bootstrap
 * is a fixture that can answer a real request. `src/test/msw/` remains and is
 * test-only — it is the harness, not a profile.
 */
const defaultApiBaseUrl = '/api/v1'

const apiBaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'VITE_API_BASE_URL must not be empty')
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#') &&
      !/\s/.test(value),
    {
      message: 'VITE_API_BASE_URL must be an origin-relative path without a query or fragment',
    },
  )
  .transform((value) => (value === '/' ? value : value.replace(/\/+$/, '')))
  .default(defaultApiBaseUrl)

/**
 * Strict boolean-ish flag. Only the literal strings `true`/`false` are accepted
 * so a typo such as `VITE_AUTH_BYPASS=1` fails loudly on startup instead of
 * silently selecting a profile.
 */
const strictFlagSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const authBypassSchema = strictFlagSchema

const environmentSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
  VITE_AUTH_BYPASS: authBypassSchema,
  MODE: z.string().trim().min(1, 'MODE must not be empty'),
  DEV: z.boolean(),
  PROD: z.boolean(),
})

export type AppEnvironment = Readonly<{
  apiBaseUrl: string
  authBypass: boolean
  /**
   * True when a development fixture can answer instead of the real backend.
   * Rendered as a visible marker so sandbox sessions are never mistaken for
   * integration evidence.
   */
  uiSandbox: boolean
  mode: string
  isDevelopment: boolean
  isProduction: boolean
}>

export function parseEnvironment(source: Record<string, unknown>): AppEnvironment {
  const result = environmentSchema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid EIAMS frontend environment configuration: ${issues}`)
  }

  const isProduction = result.data.PROD
  const authBypass = result.data.VITE_AUTH_BYPASS

  // A fixture that survives into a production build would answer real requests
  // with canned data, and the host-only refresh cookie would be bypassed. Refuse
  // to boot rather than ship that. The sibling `VITE_ENABLE_API_MOCKS` half of
  // this guard went away with `src/mocks/`; the auth bypass is the only fixture
  // left that can authenticate a production session without a backend.
  if (isProduction && authBypass) {
    throw new Error(
      'Invalid EIAMS frontend environment configuration: a production build cannot enable VITE_AUTH_BYPASS',
    )
  }

  return Object.freeze({
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    authBypass,
    uiSandbox: authBypass,
    mode: result.data.MODE,
    isDevelopment: result.data.DEV,
    isProduction,
  })
}

export const environment = parseEnvironment(import.meta.env)
