import readmeRaw from '../../README.md?raw'
import routeRegistryRaw from './route-registry.tsx?raw'
import { describe, expect, it } from 'vitest'

import { productionBuildOptions } from '@/config/production-build'

describe('production build configuration', () => {
  it('emits a modern, hashed-asset build without public source maps', () => {
    expect(productionBuildOptions).toEqual({
      target: 'es2023',
      outDir: 'dist',
      assetsDir: 'assets',
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: false,
    })
    expect(Object.isFrozen(productionBuildOptions)).toBe(true)
  })

  it("keeps the development gallery dynamic import behind Vite's build-time flag", () => {
    expect(routeRegistryRaw).toMatch(
      /const DEV_ONLY_PAGES[\s\S]*?import\.meta\.env\.DEV[\s\S]*?devGallery:\s*lazy\(\(\)\s*=>\s*import\(/u,
    )
  })

  it('documents the same-origin HTTPS deployment boundary and contract gate', () => {
    expect(readmeRaw).toContain('Production build and hosting')
    expect(readmeRaw).toContain('host-only `Secure`, `HttpOnly`')
    expect(readmeRaw).toContain('`SameSite=Strict` refresh cookie')
    expect(readmeRaw).toContain('backend/API-owner ratification')
  })
})
