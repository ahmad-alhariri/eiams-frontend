import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readBundleBudget } from '@/config/bundle-budget'
import { getWiredRouteKeys } from '@/config/route-registry'

const REGISTRY_PATH = resolve(process.cwd(), 'src/config/route-registry.tsx')
const BUDGET_PATH = resolve(process.cwd(), 'src/config/bundle-budget.json')
const registrySource = readFileSync(REGISTRY_PATH, 'utf8')

/** The shared lazily-loaded placeholder used by the routes that have no page yet. */
const PLACEHOLDER = 'routePlaceholderPage'

/** A lazily imported page, in either the one-line or the wrapped written form. */
const LAZY_IMPORT = new RegExp('\\blazy\\(\\s*\\(\\)\\s*=>\\s*import\\(', 'u')

/** A static import of a module page would put the whole page in the main chunk. */
const STATIC_PAGE_IMPORT = new RegExp('^import\\s+\\w+\\s+from\\s+\\x27@/modules/', 'mu')

/** The source of a route's entry in the registry, spanning enough lines for the wrapped form. */
function routeEntrySource(source: string, key: string): string {
  const lines = source.split(/\r?\n/u)
  const index = lines.findIndex((line) => new RegExp('^\\s*' + key + '\\s*:', 'u').test(line))
  if (index < 0) {
    return ''
  }
  return lines.slice(index, index + 3).join('\n')
}

/**
 * True when a route's page is lazily imported.
 *
 * A route qualifies when its entry is a `lazy(() => import(...))` expression -
 * written on one line or wrapped across several - or when it is the shared
 * placeholder, which is itself lazily imported.
 */
function isLazyRouteEntry(source: string, key: string): boolean {
  const entry = routeEntrySource(source, key)
  if (entry === '') {
    return false
  }
  if (LAZY_IMPORT.test(entry)) {
    return true
  }
  return new RegExp(':\\s*' + PLACEHOLDER + '\\s*,', 'u').test(entry)
}

describe('lazy-route budget', () => {
  it('wires every route page through a lazy import', () => {
    const eager = getWiredRouteKeys().filter((key) => !isLazyRouteEntry(registrySource, key))
    expect(eager).toEqual([])
  })

  it('imports no module page statically into the registry', () => {
    expect(STATIC_PAGE_IMPORT.test(registrySource)).toBe(false)
  })

  it('keeps the shared placeholder itself lazily imported', () => {
    expect(LAZY_IMPORT.test(registrySource)).toBe(true)
    expect(
      new RegExp('const\\s+' + PLACEHOLDER + '\\s*=\\s*lazy\\(', 'u').test(registrySource),
    ).toBe(true)
  })

  it('pins the wired route page count', () => {
    const budget = readBundleBudget(BUDGET_PATH)
    expect(getWiredRouteKeys().length).toBe(budget.routePageCount)
  })

  it('rejects a route entry that is not lazily imported', () => {
    // The synthetic controls prove the detector can FAIL: an eagerly imported
    // page must be rejected, and both written forms of a lazy import accepted.
    expect(isLazyRouteEntry('  demoRoute: SomeComponent,', 'demoRoute')).toBe(false)
    expect(
      isLazyRouteEntry('  demoRoute: lazy(() => import(`@/modules/x/page`)),', 'demoRoute'),
    ).toBe(true)
    expect(
      isLazyRouteEntry(
        '  demoRoute: lazy(\n    () => import(`@/modules/x/page`),\n  ),',
        'demoRoute',
      ),
    ).toBe(true)
    expect(isLazyRouteEntry('  demoRoute: routePlaceholderPage,', 'demoRoute')).toBe(true)
  })
})
