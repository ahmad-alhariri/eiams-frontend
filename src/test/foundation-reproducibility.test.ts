import componentsJsonRaw from '../../components.json?raw'
import htmlEntryRaw from '../../index.html?raw'
import packageJsonRaw from '../../package.json?raw'
import readmeRaw from '../../README.md?raw'
import setupRaw from './setup.ts?raw'
import serverRaw from './msw/server.ts?raw'
import tsconfigAppRaw from '../../tsconfig.app.json?raw'
import viteConfigRaw from '../../vite.config.ts?raw'
import workflowRaw from '../../.github/workflows/quality.yml?raw'
import { parseEnvironment } from '@/config/env'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  packageManager?: string
  scripts?: Record<string, string>
}

type ComponentsConfig = {
  rtl?: boolean
  tailwind?: {
    css?: string
  }
  aliases?: Record<string, string>
}

const packageManifest = JSON.parse(packageJsonRaw) as PackageManifest
const componentsConfig = JSON.parse(componentsJsonRaw) as ComponentsConfig

const requiredScripts = [
  'api:types:check',
  'api:types:dry',
  'api:types:generate',
  'dev',
  'build',
  'lint',
  'lint:fix',
  'typecheck',
  'test',
  'test:watch',
  'format',
  'format:check',
  'quality',
  'preview',
] as const

describe('foundation reproducibility', () => {
  it('pins the package manager and exposes the expected foundation commands', () => {
    expect(packageManifest.packageManager).toBe('pnpm@11.20.0')

    for (const script of requiredScripts) {
      expect(packageManifest.scripts?.[script]).toEqual(expect.any(String))
    }

    expect(packageManifest.scripts?.['quality']).toBe(
      'pnpm run api:types:check && pnpm run lint && pnpm run typecheck && pnpm run format:check && pnpm run test && pnpm run build',
    )
  })

  it('keeps the TypeScript, Vite, Vitest, and MSW foundation wired together', () => {
    expect(tsconfigAppRaw).toContain('"strict": true')
    expect(tsconfigAppRaw).toMatch(/"@\/\*":\s*\[\s*"src\/\*"\s*\]/)
    expect(tsconfigAppRaw).toContain('"types": ["vite/client"]')
    expect(tsconfigAppRaw).toContain('"include": ["src"]')

    expect(viteConfigRaw).toMatch(/alias:\s*{\s*'@':/)
    expect(viteConfigRaw).toContain("setupFiles: ['./src/test/setup.ts']")
    expect(viteConfigRaw).toContain("include: ['src/**/*.{test,spec}.{ts,tsx}']")

    expect(setupRaw).toContain('@testing-library/jest-dom/vitest')
    expect(setupRaw).toContain("server.listen({ onUnhandledRequest: 'error' })")
    expect(setupRaw).toContain('server.resetHandlers()')
    expect(setupRaw).toContain('server.close()')
    expect(serverRaw).toContain('setupServer(...handlers)')
  })

  it('preserves the RTL entry, shared UI config, same-origin env, and CI gate', () => {
    expect(htmlEntryRaw).toContain('<html lang="ar" dir="rtl">')
    expect(parseEnvironment({ MODE: 'test', DEV: false, PROD: false }).apiBaseUrl).toBe('/api/v1')
    expect(readmeRaw).toContain('VITE_API_BASE_URL=/api/v1')

    expect(componentsConfig.rtl).toBe(true)
    expect(componentsConfig.tailwind?.css).toBe('src/index.css')
    expect(componentsConfig.aliases?.['ui']).toBe('@/shared/ui')
    expect(componentsConfig.aliases?.['utils']).toBe('@/shared/utils/class-names')

    expect(workflowRaw).toContain('pnpm install --frozen-lockfile')
    expect(workflowRaw).toContain('pnpm run quality')
  })
})
