import { describe, expect, it } from 'vitest'
import { environment, parseEnvironment, type AppEnvironment } from '@/config/env'

const viteEnvironment = {
  MODE: 'test',
  DEV: false,
  PROD: false,
}

describe('environment configuration', () => {
  it('exposes the validated Vite runtime environment as a frozen AppEnvironment', () => {
    // This case asserts the SHAPE of the ambient `environment` object, not
    // any specific fixture flag value. Specific flag values depend on the
    // developer's local .env / .env.local, which Vitest merges into
    // import.meta.env before this module loads, so asserting 'uiSandbox:
    // false' here would fail for any developer who opts into the ui-sandbox
    // profile without recording that the failure was environmental (see
    // eiams-frontend-2pqj).
    //
    // The default flag value itself is covered by the explicit-input
    // cases below — "leaves the development fixture off when nothing is
    // set" passes an empty viteEnvironment and proves the default.
    expect(Object.isFrozen(environment)).toBe(true)
    const expectedShape: Record<keyof AppEnvironment, 'string' | 'boolean'> = {
      apiBaseUrl: 'string',
      authBypass: 'boolean',
      uiSandbox: 'boolean',
      mode: 'string',
      isDevelopment: 'boolean',
      isProduction: 'boolean',
    }
    for (const [key, kind] of Object.entries(expectedShape)) {
      const value = (environment as Record<string, unknown>)[key]
      expect(typeof value, `environment.${key}`).toBe(kind)
    }
    // `VITE_ENABLE_API_MOCKS` was retired with `src/mocks/`
    // (eiams-frontend-m4jm). An unknown key is not rejected by the schema, so
    // a stray leftover in a developer's `.env.local` would otherwise be accepted
    // silently and read as if it still selected a profile. It must be inert.
    expect(environment).not.toHaveProperty('enableApiMocks')
    expect(environment.mode).toBe('test')
  })

  it('ignores a retired VITE_ENABLE_API_MOCKS instead of honouring it', () => {
    const environment = parseEnvironment({
      ...viteEnvironment,
      VITE_ENABLE_API_MOCKS: 'true',
    })

    expect(environment.uiSandbox).toBe(false)
    expect(environment).not.toHaveProperty('enableApiMocks')
  })

  it('uses the documented same-origin API path by default', () => {
    const environment = parseEnvironment(viteEnvironment)

    expect(environment).toEqual({
      apiBaseUrl: '/api/v1',
      authBypass: false,
      uiSandbox: false,
      mode: 'test',
      isDevelopment: false,
      isProduction: false,
    })
    expect(Object.isFrozen(environment)).toBe(true)
  })

  describe('RESOLUTION-040 real-integration default', () => {
    it('leaves the development fixture off when nothing is set', () => {
      const environment = parseEnvironment(viteEnvironment)

      expect(environment.authBypass).toBe(false)
      expect(environment.uiSandbox).toBe(false)
    })

    it('marks the session as a sandbox when VITE_AUTH_BYPASS is enabled', () => {
      const environment = parseEnvironment({
        ...viteEnvironment,
        VITE_AUTH_BYPASS: 'true',
      })

      expect(environment.uiSandbox).toBe(true)
    })

    it('keeps the sandbox off when only the real profile is requested', () => {
      const environment = parseEnvironment({
        ...viteEnvironment,
        VITE_AUTH_BYPASS: 'false',
      })

      expect(environment.uiSandbox).toBe(false)
    })

    it('refuses to boot a production build with VITE_AUTH_BYPASS enabled', () => {
      expect(() =>
        parseEnvironment({ ...viteEnvironment, PROD: true, VITE_AUTH_BYPASS: 'true' }),
      ).toThrow('a production build cannot enable VITE_AUTH_BYPASS')
    })

    it('allows a production build when the fixture is off', () => {
      const environment = parseEnvironment({ ...viteEnvironment, PROD: true })

      expect(environment.isProduction).toBe(true)
      expect(environment.uiSandbox).toBe(false)
    })
  })

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
