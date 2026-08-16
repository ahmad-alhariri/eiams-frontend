import { describe, expect, it } from 'vitest'
import { environment, parseEnvironment } from '@/config/env'

const viteEnvironment = {
  MODE: 'test',
  DEV: false,
  PROD: false,
}

describe('environment configuration', () => {
  it('exposes the validated Vite runtime environment', () => {
    expect(environment).toMatchObject({
      apiBaseUrl: '/api/v1',
      enableApiMocks: true,
      mode: 'test',
      isDevelopment: true,
      isProduction: false,
    })
  })

  it('uses the documented same-origin API path by default', () => {
    const environment = parseEnvironment(viteEnvironment)

    expect(environment).toEqual({
      apiBaseUrl: '/api/v1',
      enableApiMocks: true,
      mode: 'test',
      isDevelopment: false,
      isProduction: false,
    })
    expect(Object.isFrozen(environment)).toBe(true)
  })

  it('disables development API mocks with an explicit flag', () => {
    const environment = parseEnvironment({
      ...viteEnvironment,
      VITE_ENABLE_API_MOCKS: 'false',
    })

    expect(environment.enableApiMocks).toBe(false)
  })

  it.each(['1', 'TRUE', '', 'yes'])(
    'rejects an unsupported mocks flag value: %s',
    (enableApiMocks) => {
      expect(() =>
        parseEnvironment({
          ...viteEnvironment,
          VITE_ENABLE_API_MOCKS: enableApiMocks,
        }),
      ).toThrowError(
        'Invalid EIAMS frontend environment configuration: VITE_ENABLE_API_MOCKS: Invalid option: expected one of "true"|"false"',
      )
    },
  )

  it('normalizes a configured origin-relative API path', () => {
    const environment = parseEnvironment({
      ...viteEnvironment,
      VITE_API_BASE_URL: ' /gateway/api/v1/ ',
    })

    expect(environment.apiBaseUrl).toBe('/gateway/api/v1')
  })

  it.each(['https://api.example.test/api/v1', '//api.example.test', 'api/v1', '/api/v1?debug=1'])(
    'rejects an unsafe API base URL: %s',
    (apiBaseUrl) => {
      expect(() =>
        parseEnvironment({
          ...viteEnvironment,
          VITE_API_BASE_URL: apiBaseUrl,
        }),
      ).toThrowError('VITE_API_BASE_URL must be an origin-relative path')
    },
  )

  it('reports missing Vite runtime metadata', () => {
    expect(() => parseEnvironment({})).toThrowError(
      'Invalid EIAMS frontend environment configuration',
    )
  })
})
