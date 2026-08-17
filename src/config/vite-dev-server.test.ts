import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import viteConfigRaw from '../../vite.config.ts?raw'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_DEV_API_PROXY_TARGET,
  resolveDevApiProxy,
} from '@/config/vite-dev-server'

const envExampleRaw = readFileSync(join(process.cwd(), '.env.example'), 'utf8')

describe('development API proxy configuration', () => {
  it('proxies the default origin-relative API path to the default dev backend', () => {
    expect(resolveDevApiProxy({})).toEqual({
      context: DEFAULT_API_BASE_URL,
      target: DEFAULT_DEV_API_PROXY_TARGET,
      changeOrigin: true,
    })
  })

  it('derives the proxy context from the configured API base URL', () => {
    expect(resolveDevApiProxy({ VITE_API_BASE_URL: '/api/v2/' })?.context).toBe('/api/v2')
  })

  it('honors an explicit server-side proxy target', () => {
    expect(resolveDevApiProxy({ EIAMS_DEV_PROXY_TARGET: 'http://localhost:5210' })?.target).toBe(
      'http://localhost:5210',
    )
  })

  it('falls back to the default target for a blank proxy target', () => {
    expect(resolveDevApiProxy({ EIAMS_DEV_PROXY_TARGET: '  ' })?.target).toBe(
      DEFAULT_DEV_API_PROXY_TARGET,
    )
  })

  it.each([
    ['a whole-origin base URL', { VITE_API_BASE_URL: '/' }],
    ['an absolute base URL', { VITE_API_BASE_URL: 'https://api.example.com/api' }],
    ['a base URL with a query', { VITE_API_BASE_URL: '/api/v1?debug=1' }],
    ['a backslash base URL', { VITE_API_BASE_URL: '\\api\\v1' }],
  ])('skips the proxy for %s', (_label, env) => {
    expect(resolveDevApiProxy(env)).toBeNull()
  })

  it('wires the proxy into the Vite dev server from the environment', () => {
    expect(viteConfigRaw).toMatch(/loadEnv\(mode/)
    expect(viteConfigRaw).toMatch(/\.\.\.\(devApiProxy\s*\?/)
    expect(viteConfigRaw).toContain("resolveDevApiProxy(loadEnv(mode, process.cwd(), ''))")
  })

  it('documents the proxy target as a server-side-only environment variable', () => {
    expect(envExampleRaw).toContain('EIAMS_DEV_PROXY_TARGET')
    expect(envExampleRaw).not.toContain('VITE_DEV_PROXY_TARGET')
  })
})
