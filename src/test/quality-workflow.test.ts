import packageJsonRaw from '../../package.json?raw'
import qualityWorkflow from '../../.github/workflows/quality.yml?raw'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  packageManager?: string
  scripts?: Record<string, string>
}

const packageManifest = JSON.parse(packageJsonRaw) as PackageManifest

describe('continuous quality workflow', () => {
  it('runs every local quality gate in the CI order', () => {
    expect(packageManifest.scripts?.['quality']).toBe(
      'pnpm run api:types:check && pnpm run lint && pnpm run typecheck && pnpm run format:check && pnpm run test && pnpm run build',
    )
  })

  it('uses frozen pnpm installation before the quality gate', () => {
    expect(packageManifest.packageManager).toBe('pnpm@11.20.0')
    expect(qualityWorkflow).toContain('node-version: 24')
    expect(qualityWorkflow).toContain('corepack prepare pnpm@11.20.0 --activate')
    expect(qualityWorkflow).toContain('pnpm install --frozen-lockfile')
    expect(qualityWorkflow).toContain('pnpm run quality')
  })
})
