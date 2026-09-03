import { z } from 'zod'

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

const enableApiMocksSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

/**
 * D-SRS-01 singular-session feature flag.
 *
 * When true, the frontend trusts the contract's singular activeScope and never
 * offers a client-side scope picker; an authenticated session is either
 * `Selected` (render protected routes) or `Unavailable` (render no-access).
 * When false (the default until the backend whhu.11 lands), the legacy
 * availableScopes-based switcher remains in place for the existing dev MSW.
 *
 * Drop the flag entirely once `whhu.11` closes: the switcher code, the
 * `SelectionRequired` branch in route-guards, the `/session/scope` route,
 * the `switchScope` mutation, and the experimental key all become dead code.
 */
const experimentalSingularSessionSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const environmentSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
  VITE_ENABLE_API_MOCKS: enableApiMocksSchema,
  VITE_EXPERIMENTAL_SINGULAR_SESSION: experimentalSingularSessionSchema,
  MODE: z.string().trim().min(1, 'MODE must not be empty'),
  DEV: z.boolean(),
  PROD: z.boolean(),
})

export type AppEnvironment = Readonly<{
  apiBaseUrl: string
  enableApiMocks: boolean
  experimentalSingularSession: boolean
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

  return Object.freeze({
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    enableApiMocks: result.data.VITE_ENABLE_API_MOCKS,
    experimentalSingularSession: result.data.VITE_EXPERIMENTAL_SINGULAR_SESSION,
    mode: result.data.MODE,
    isDevelopment: result.data.DEV,
    isProduction: result.data.PROD,
  })
}

export const environment = parseEnvironment(import.meta.env)
