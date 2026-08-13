import componentsJsonRaw from '../../components.json?raw'
import packageJsonRaw from '../../package.json?raw'
import readmeRaw from '../../README.md?raw'
import classNamesRaw from '../shared/utils/class-names.ts?raw'
import { describe, expect, it } from 'vitest'

type ComponentsConfig = {
  style?: string
  rsc?: boolean
  tsx?: boolean
  tailwind?: {
    config?: string
    css?: string
    cssVariables?: boolean
    prefix?: string
  }
  iconLibrary?: string
  rtl?: boolean
  aliases?: Record<string, string>
}

type PackageManifest = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
}

const componentsConfig = JSON.parse(componentsJsonRaw) as ComponentsConfig
const packageManifest = JSON.parse(packageJsonRaw) as PackageManifest

describe('shadcn Base UI generation configuration', () => {
  it('targets the approved shared RTL Base UI architecture', () => {
    expect(componentsConfig).toMatchObject({
      style: 'base-vega',
      rsc: false,
      tsx: true,
      iconLibrary: 'tabler',
      rtl: true,
      tailwind: {
        config: '',
        css: 'src/index.css',
        cssVariables: true,
        prefix: '',
      },
    })

    expect(componentsConfig.aliases).toEqual({
      components: '@/shared/ui',
      utils: '@/shared/utils/class-names',
      ui: '@/shared/ui',
      lib: '@/shared',
      hooks: '@/shared/hooks',
    })
  })

  it('retains the dependencies and shared utility required by generated primitives', () => {
    expect(packageManifest.dependencies).toMatchObject({
      '@base-ui/react': expect.any(String),
      '@tabler/icons-react': expect.any(String),
      '@tailwindcss/vite': expect.any(String),
      'class-variance-authority': expect.any(String),
      clsx: expect.any(String),
      shadcn: expect.any(String),
      'tailwind-merge': expect.any(String),
      tailwindcss: expect.any(String),
      'tw-animate-css': expect.any(String),
    })

    expect(classNamesRaw).toContain('twMerge(clsx(inputs))')
  })

  it('provides an inspectable dry-run-first generation workflow', () => {
    expect(packageManifest.scripts).toMatchObject({
      'ui:info': 'shadcn info',
      'ui:add:dry': 'shadcn add --dry-run',
      'ui:add': 'shadcn add',
    })

    expect(readmeRaw).toContain('pnpm run ui:add:dry <component>')
    expect(readmeRaw).toContain('pnpm run ui:add <component>')
    expect(readmeRaw).toContain('Generated output must remain in `src/shared/ui`')
  })
})
