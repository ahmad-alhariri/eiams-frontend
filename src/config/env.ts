import { z } from 'zod'

/**
 * Development environment profiles (RESOLUTION-040, D-INT-02).
 *
 * Two mutually exclusive profiles exist, and real backend integration is the
 * default so that "mocks disabled" is no longer mistaken for proof of the real
 * authentication flow:
 *
 * | Profile         | `VITE_ENABLE_API_MOCKS` | `VITE_AUTH_BYPASS` | Evidence it produces      |
 * | --------------- | ----------------------- | ------------------ | ------------------------- |
 * | real-backend    | `false`                 | `false`            | genuine integration       |
 * | ui-sandbox      | `true` and/or `true`    | explicit opt-in    | fixture only, must be marked |
 *
 * Both fixtures are opt-in. `uiSandbox` reports whether either is active so the
 * shell can mark the session, because a fixture-authenticated UI is not evidence
 * of backend integration.
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
 * so a typo such as `VITE_ENABLE_API_MOCKS=1` fails loudly on startup instead of
 * silently selecting a profile.
 */
const strictFlagSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const enableApiMocksSchema = strictFlagSchema
const authBypassSchema = strictFlagSchema

const environmentSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
  VITE_ENABLE_API_MOCKS: enableApiMocksSchema,
  VITE_AUTH_BYPASS: authBypassSchema,
  MODE: z.string().trim().min(1, 'MODE must not be empty'),
  DEV: z.boolean(),
  PROD: z.boolean(),
})

export type AppEnvironment = Readonly<{
  apiBaseUrl: string
  enableApiMocks: boolean
  authBypass: boolean
  /**
   * True when any development fixture can answer instead of the real backend.
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
  const enableApiMocks = result.data.VITE_ENABLE_API_MOCKS
  const authBypass = result.data.VITE_AUTH_BYPASS

  // A fixture that survives into a production build would silently answer real
  // requests with canned data, and the host-only refresh cookie would be
  // bypassed. Refuse to boot rather than ship that.
  if (isProduction && (enableApiMocks || authBypass)) {
    throw new Error(
      'Invalid EIAMS frontend environment configuration: a production build cannot enable VITE_ENABLE_API_MOCKS or VITE_AUTH_BYPASS',
    )
  }

  return Object.freeze({
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    enableApiMocks,
    authBypass,
    uiSandbox: enableApiMocks || authBypass,
    mode: result.data.MODE,
    isDevelopment: result.data.DEV,
    isProduction,
  })
}

export const environment = parseEnvironment(import.meta.env)
