/**
 * The committed bundle budget.
 *
 * These numbers are REGRESSION CEILINGS, not performance targets: they were
 * derived from a production build on 2026-10-28 and exist so that a change
 * which quietly inflates the shipped bundle fails the build instead of
 * reaching users. No product document states a bundle target, so the ceiling
 * is the current measurement and nothing more.
 *
 * The budget itself lives in `bundle-budget.json` so that the check script
 * (`scripts/check-bundle-budget.mjs`) and this module read ONE committed
 * source rather than two copies of the same numbers.
 */
import { readFileSync } from 'node:fs'

export interface BundleBudget {
  readonly maxJsChunkCount: number
  readonly maxJsTotalBytes: number
  readonly maxLargestChunkBytes: number
  readonly routePageCount: number
}

export interface BundleMeasurement {
  readonly jsChunkCount: number
  readonly jsTotalBytes: number
  readonly largestChunkBytes: number
}

export type BundleMetric = 'jsChunkCount' | 'jsTotalBytes' | 'largestChunkBytes'

export interface BundleBudgetBreach {
  readonly metric: BundleMetric
  readonly measured: number
  readonly ceiling: number
}

/** Reads the committed budget. Throws loudly if the file is missing or malformed. */
export function readBundleBudget(jsonPath: string): BundleBudget {
  const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid bundle budget at ${jsonPath}: expected an object`)
  }
  const record = parsed as Record<string, unknown>
  const numbers = {
    maxJsChunkCount: record['maxJsChunkCount'],
    maxJsTotalBytes: record['maxJsTotalBytes'],
    maxLargestChunkBytes: record['maxLargestChunkBytes'],
    routePageCount: record['routePageCount'],
  }
  for (const [name, value] of Object.entries(numbers)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid bundle budget at ${jsonPath}: ${name} must be a positive number`)
    }
  }
  return numbers as unknown as BundleBudget
}

/**
 * Compares a measurement against the ceiling.
 *
 * A breach is reported when the measurement is ABOVE the ceiling: these are
 * growth ceilings, so a smaller bundle is never a failure.
 */
export function findBundleBudgetBreaches(
  measurement: BundleMeasurement,
  budget: BundleBudget,
): BundleBudgetBreach[] {
  const breaches: BundleBudgetBreach[] = []
  const checks: readonly (readonly [BundleMetric, number, number])[] = [
    ['jsChunkCount', measurement.jsChunkCount, budget.maxJsChunkCount],
    ['jsTotalBytes', measurement.jsTotalBytes, budget.maxJsTotalBytes],
    ['largestChunkBytes', measurement.largestChunkBytes, budget.maxLargestChunkBytes],
  ]
  for (const [metric, measured, ceiling] of checks) {
    if (measured > ceiling) {
      breaches.push({ metric, measured, ceiling })
    }
  }
  return breaches
}
