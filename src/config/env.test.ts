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
      enableApiMocks: false,
      authBypass: false,
      uiSandbox: false,
      mode: 'test',
      isDevelopment: true,
      isProduction: false,
    })
  })

  it('uses the documented same-origin API path by default', () => {
    const environment = parseEnvironment(viteEnvironment)

    expect(environment).toEqual({
      apiBaseUrl: '/api/v1',
      enableApiMocks: false,
      authBypass: false,
      uiSandbox: false,
      mode: 'test',
      isDevelopment: false,
      isProduction: false,
    })
    expect(Object.isFrozen(environment)).toBe(true)
  })

  describe('RESOLUTION-040 real-integration default', () => {
    it('leaves both development fixtures off when nothing is set', () => {
      const environment = parseEnvironment(viteEnvironment)

      expect(environment.enableApiMocks).toBe(false)
      expect(environment.authBypass).toBe(false)
      expect(environment.uiSandbox).toBe(false)
    })

    it.each(['VITE_ENABLE_API_MOCKS', 'VITE_AUTH_BYPASS'])(
      'marks the session as a sandbox when %s is enabled',
      (flag) => {
        const environment = parseEnvironment({ ...viteEnvironment, [flag]: 'true' })

        expect(environment.uiSandbox).toBe(true)
      },
    )

    it('keeps the sandbox off when only the real profile is requested', () => {
      const environment = parseEnvironment({
        ...viteEnvironment,
        VITE_ENABLE_API_MOCKS: 'false',
        VITE_AUTH_BYPASS: 'false',
      })

      expect(environment.uiSandbox).toBe(false)
    })

    it.each(['VITE_ENABLE_API_MOCKS', 'VITE_AUTH_BYPASS'])(
      'refuses to boot a production build with %s enabled',
      (flag) => {
        expect(() => parseEnvironment({ ...viteEnvironment, PROD: true, [flag]: 'true' })).toThrow(
          'a production build cannot enable VITE_ENABLE_API_MOCKS or VITE_AUTH_BYPASS',
        )
      },
    )

    it('allows a production build when both fixtures are off', () => {
      const environment = parseEnvironment({ ...viteEnvironment, PROD: true })

      expect(environment.isProduction).toBe(true)
      expect(environment.uiSandbox).toBe(false)
    })
  })

  it('enables development API mocks with an explicit flag', () => {
    const environment = parseEnvironment({
      ...viteEnvironment,
      VITE_ENABLE_API_MOCKS: 'true',
    })

    expect(environment.enableApiMocks).toBe(true)
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

  it.each(['1', 'TRUE', '', 'yes'])(
    'rejects an unsupported auth-bypass flag value: %s',
    (authBypass) => {
      expect(() =>
        parseEnvironment({
          ...viteEnvironment,
          VITE_AUTH_BYPASS: authBypass,
        }),
      ).toThrowError(
        'Invalid EIAMS frontend environment configuration: VITE_AUTH_BYPASS: Invalid option: expected one of "true"|"false"',
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
