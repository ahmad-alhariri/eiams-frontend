import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  consumedEndpointsIn,
  describeDrifts,
  findDrift,
  liveOperations,
  type ConsumerBaseline,
} from './openapi-drift'
import { applicationSourceFiles, readSource, relativeToRepo } from '@/test/support/source-scan'

/**
 * The live half of the contract-drift gate. Skipped unless `EIMS_OPENAPI_URL`
 * points at a running backend's swagger document, so `pnpm run test` never needs
 * a server; `pnpm run contract:drift` is what runs it.
 *
 * The baseline is a RATCHET captured from the live API, not a mirror of the
 * provisional design snapshot: the snapshot is ArchitectureOwnedProvisional
 * with 81 paths while the implemented API serves 134, so "live == snapshot"
 * would be permanently red and would prove nothing about the frontend.
 */

const OPENAPI_URL = process.env['EIMS_OPENAPI_URL']
const BASELINE_PATH = join(process.cwd(), 'contracts/openapi/eiams-v1.consumer-baseline.json')

function consumedEndpoints(): ReturnType<typeof consumedEndpointsIn> {
  return applicationSourceFiles()
    .filter((file) =>
      /\btransport\s*\.\s*(request|requestPage|requestEmpty)\b/u.test(readSource(file)),
    )
    .flatMap((file) => consumedEndpointsIn(readSource(file), relativeToRepo(file)))
}

async function loadLive(url: string): Promise<unknown> {
  // A local path is accepted so a doctored copy can be proved to fail without
  // touching the running API, which is the only way to show the gate fires.
  if (!/^https?:\/\//u.test(url)) {
    return JSON.parse(await readFile(resolve(url), 'utf8')) as unknown
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`)
  return response.json()
}

describe.skipIf(OPENAPI_URL === undefined)('live API contract drift', () => {
  it('matches the committed consumer baseline', async () => {
    const [document, baseline] = await Promise.all([
      loadLive(OPENAPI_URL as string),
      readFile(BASELINE_PATH, 'utf8').then((text) => JSON.parse(text) as ConsumerBaseline),
    ])
    const liveDocument = document as Record<string, unknown>

    const drifts = findDrift(consumedEndpoints(), baseline, liveOperations(liveDocument))

    expect(describeDrifts(drifts)).toEqual([])
  })
})
