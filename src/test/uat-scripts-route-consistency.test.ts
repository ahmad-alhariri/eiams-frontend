import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'

/**
 * The Arabic UAT scripts quote real routes and real Arabic labels so that QA
 * navigates to pages that exist. This test keeps the document honest: if a
 * route is renamed or a label is reworded, the scripts must break loudly
 * instead of silently sending the tester to a 404 or to the wrong screen.
 */
const SCRIPTS_PATH = resolve(process.cwd(), 'qa-artifacts/browser/EIAMS-UAT-SCRIPTS-AR.md')
const scripts = readFileSync(SCRIPTS_PATH, 'utf8')

const quotedPaths = [...scripts.matchAll(/^- \*\*المسار:\*\* `([^`]+)`$/gmu)].map((m) => m[1] ?? '')
const quotedLabels = [...scripts.matchAll(/^- \*\*العنوان:\*\* (.+)$/gmu)].map((m) =>
  (m[1] ?? '').trim(),
)

describe('the Arabic UAT scripts match the route registry', () => {
  it('declares scenario routes and labels', () => {
    expect(quotedPaths.length).toBeGreaterThan(0)
    expect(quotedLabels.length).toBeGreaterThan(0)
  })

  it('quotes only paths the route registry declares', () => {
    const known = new Set<string>(Object.values(ROUTE_PATHS))
    expect(quotedPaths.filter((path) => !known.has(path))).toEqual([])
  })

  it('quotes only Arabic labels the route registry declares', () => {
    const known = new Set<string>(Object.values(ROUTE_METADATA).map((entry) => entry.labelAr))
    expect(quotedLabels.filter((label) => !known.has(label))).toEqual([])
  })
})
