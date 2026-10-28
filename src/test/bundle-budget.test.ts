import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

import {
  findBundleBudgetBreaches,
  readBundleBudget,
  type BundleBudget,
  type BundleMeasurement,
} from '@/config/bundle-budget'

const budgetPath = resolve(process.cwd(), 'src/config/bundle-budget.json')

describe('bundle budget', () => {
  it('reads a committed budget with positive ceilings', () => {
    const budget = readBundleBudget(budgetPath)

    expect(budget.maxJsChunkCount).toBeGreaterThan(0)
    expect(budget.maxJsTotalBytes).toBeGreaterThan(0)
    expect(budget.maxLargestChunkBytes).toBeGreaterThan(0)
    expect(budget.routePageCount).toBeGreaterThan(0)
  })

  it('reports no breach for a measurement at or below the ceiling', () => {
    const budget = readBundleBudget(budgetPath)
    const measurement: BundleMeasurement = {
      jsChunkCount: budget.maxJsChunkCount,
      jsTotalBytes: budget.maxJsTotalBytes,
      largestChunkBytes: budget.maxLargestChunkBytes,
    }

    expect(findBundleBudgetBreaches(measurement, budget)).toEqual([])
  })

  it('reports no breach for a bundle SMALLER than the ceiling', () => {
    const budget = readBundleBudget(budgetPath)
    const measurement: BundleMeasurement = {
      jsChunkCount: 1,
      jsTotalBytes: 1,
      largestChunkBytes: 1,
    }

    expect(findBundleBudgetBreaches(measurement, budget)).toEqual([])
  })

  it('reports a breach for every metric above the ceiling', () => {
    const budget: BundleBudget = {
      maxJsChunkCount: 10,
      maxJsTotalBytes: 100,
      maxLargestChunkBytes: 50,
      routePageCount: 5,
    }
    const measurement: BundleMeasurement = {
      jsChunkCount: 11,
      jsTotalBytes: 101,
      largestChunkBytes: 51,
    }

    expect(findBundleBudgetBreaches(measurement, budget)).toEqual([
      { metric: 'jsChunkCount', measured: 11, ceiling: 10 },
      { metric: 'jsTotalBytes', measured: 101, ceiling: 100 },
      { metric: 'largestChunkBytes', measured: 51, ceiling: 50 },
    ])
  })
})
