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

const environmentSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
  VITE_ENABLE_API_MOCKS: enableApiMocksSchema,
  MODE: z.string().trim().min(1, 'MODE must not be empty'),
  DEV: z.boolean(),
  PROD: z.boolean(),
})

export type AppEnvironment = Readonly<{
  apiBaseUrl: string
  enableApiMocks: boolean
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
    mode: result.data.MODE,
    isDevelopment: result.data.DEV,
    isProduction: result.data.PROD,
  })
}

export const environment = parseEnvironment(import.meta.env)
