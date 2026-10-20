import { describe, expect, it } from 'vitest'

import {
  consumedEndpointsIn,
  describeDrifts,
  findDrift,
  label,
  liveOperations,
  pathTemplateMatches,
  stripApiBase,
  toBaseline,
  type ConsumedEndpoint,
  type ConsumerBaseline,
  type JsonNode,
} from './openapi-drift'
import { applicationSourceFiles, readSource, relativeToRepo } from '@/test/support/source-scan'

/**
 * The gate is only worth having if it fires on drift, so every "green" case
 * here is paired with the doctored document that makes the same code go red.
 * A ratchet that cannot be seen to move is indistinguishable from no gate.
 */

const TRANSPORT_SOURCE = `
const DOCS_PATH = '/warehouse-documents'
const DOC_PATH = '/warehouse-documents/{documentId}'
const SUBMIT_PATH = '/warehouse-documents/{documentId}/submit' satisfies keyof paths

function pathWithDocumentId(path: string, id: string): string {
  return path.replace('{documentId}', id)
}

export function createService(transport: ApiTransport) {
  const executeEmptyAction = async (path: string) => transport.requestEmpty({ path, method: 'POST' })
  return {
    list: () => transport.requestPage({ path: DOCS_PATH, method: 'GET' }),
    get: (id: string) => transport.request({ path: pathWithDocumentId(DOC_PATH, id), method: 'GET' }),
    create: () => transport.request({ path: DOCS_PATH, method: 'POST' }),
    submit: (id: string) => executeEmptyAction(pathWithDocumentId(SUBMIT_PATH, id)),
  }
}
`

describe('consumed-endpoint discovery', () => {
  it('reads paths from module constants and pairs them with the adjacent method', () => {
    const endpoints = consumedEndpointsIn(TRANSPORT_SOURCE, 'doc-transport.ts')

    expect(endpoints.map(label).sort()).toEqual([
      'ANY /warehouse-documents/{documentId}/submit',
      'GET /warehouse-documents',
      'GET /warehouse-documents/{documentId}',
      'POST /warehouse-documents',
    ])
  })

  it('records a helper-argument path with no method rather than guessing one', () => {
    // `executeEmptyAction(pathWithDocumentId(SUBMIT_PATH, id), ...)` passes the
    // path away from any literal `path:`/`method:` pair. Guessing POST here
    // would report a missing POST on a route that exists.
    const endpoints = consumedEndpointsIn(TRANSPORT_SOURCE, 'doc-transport.ts')
    const submit = endpoints.find((e) => e.path.endsWith('/submit'))

    expect(submit?.method).toBeNull()
  })

  it('ignores a file that never reaches the transport', () => {
    // A router config with `path:` strings is not an API consumer.
    const router = `const routes = [{ path: '/warehouse-documents', element: X }]\nexport default routes`
    expect(consumedEndpointsIn(router, 'routes.ts')).toEqual([])
  })

  it('ignores a non-path string that is not a constant declaration', () => {
    const source = `export function f() { return transport.request({ path: '*', method: 'GET' }) }`
    expect(consumedEndpointsIn(source, 'f.ts')).toEqual([])
  })

  it('finds the real API paths of this repo', () => {
    const files = applicationSourceFiles()
    const endpoints = files
      .filter((file) =>
        /\btransport\s*\.\s*(request|requestPage|requestEmpty)\b/u.test(readSource(file)),
      )
      .flatMap((file) => consumedEndpointsIn(readSource(file), relativeToRepo(file)))

    // The repo calls well over 40 distinct API paths. A scan that suddenly
    // finds fewer means the resolver broke, not that the frontend shrank.
    expect(endpoints.length).toBeGreaterThanOrEqual(40)
    const names = new Set(endpoints.map(label))
    // Submit/reject/cancel reach the transport as a helper argument, so the
    // discovery records the path without a verb rather than guessing POST.
    expect(names).toContain('ANY /warehouse-documents/{documentId}/submit')
    expect(names).toContain('GET /warehouse-documents/{documentId}')
    expect(names).toContain('POST /auth/login')
  })
})

describe('path normalisation', () => {
  it('strips the live server base path', () => {
    expect(stripApiBase('/api/v1/warehouse-documents')).toBe('/warehouse-documents')
    expect(stripApiBase('/warehouse-documents')).toBe('/warehouse-documents')
  })

  it('matches a template segment against any single live segment', () => {
    expect(pathTemplateMatches('/warehouse-documents/{documentId}', '/warehouse-documents')).toBe(
      false,
    )
    expect(
      pathTemplateMatches('/warehouse-documents/{documentId}', '/warehouse-documents/abc-123'),
    ).toBe(true)
  })

  it('does not match a different segment count or a literal mismatch', () => {
    expect(pathTemplateMatches('/sites/{siteId}', '/sites')).toBe(false)
    expect(pathTemplateMatches('/sites', '/organizations')).toBe(false)
  })
})

/** A minimal document in the live API's shape: envelope wrapping a payload. */
function liveDocument(payloadProperties: readonly string[] = ['code', 'id', 'nameAr']): JsonNode {
  return {
    openapi: '3.0.1',
    paths: {
      '/api/v1/warehouses/{warehouseId}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse`1' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        'ApiResponse`1': {
          properties: {
            success: { type: 'boolean' },
            data: { $ref: '#/components/schemas/WarehouseResponse' },
          },
        },
        WarehouseResponse: {
          properties: Object.fromEntries(
            payloadProperties.map((name) => [name, { type: 'string' }]),
          ),
        },
      },
    },
  }
}

const WAREHOUSE_ENDPOINT: ConsumedEndpoint = {
  source: 'src/modules/warehouse/services/warehouse.service.ts',
  path: '/warehouses/{warehouseId}',
  method: 'GET',
}

const BASELINE: ConsumerBaseline = {
  endpoints: [
    {
      path: '/warehouses/{warehouseId}',
      method: 'GET',
      sources: ['src/modules/warehouse/services/warehouse.service.ts'],
      responseProperties: ['code', 'id', 'nameAr'],
    },
  ],
}

describe('response fingerprinting', () => {
  it('descends through the envelope to the payload the frontend types describe', () => {
    const operations = liveOperations(liveDocument())
    const operation = operations.get('GET /warehouses/{warehouseId}')

    expect(operation?.responseProperties).toEqual(['code', 'id', 'nameAr'])
  })

  it('keys operations by the live path with the base path stripped', () => {
    const operations = liveOperations(liveDocument())
    expect([...operations.keys()]).toEqual(['GET /warehouses/{warehouseId}'])
  })

  it('reads the lowest 2xx, because creates answer 201', () => {
    const document = {
      paths: {
        '/api/v1/warehouses': {
          post: {
            responses: {
              '201': {
                content: { 'application/json': { schema: { properties: { id: {} } } } },
              },
              '400': { content: { 'application/json': { schema: { properties: { code: {} } } } } },
            },
          },
        },
      },
    }
    const operations = liveOperations(document)
    expect(operations.get('POST /warehouses')?.responseProperties).toEqual(['id'])
  })
})

describe('the drift gate', () => {
  it('is green when the live API still matches the baseline', () => {
    const drifts = findDrift([WAREHOUSE_ENDPOINT], BASELINE, liveOperations(liveDocument()))
    expect(describeDrifts(drifts)).toEqual([])
  })

  it('names the method, the path and the property that went away (A3)', () => {
    const live = liveOperations(liveDocument(['id', 'nameAr']))

    const drifts = findDrift([WAREHOUSE_ENDPOINT], BASELINE, live)

    expect(drifts).toHaveLength(1)
    expect(drifts[0]?.endpoint).toBe('GET /warehouses/{warehouseId}')
    expect(drifts[0]?.message).toContain('removed: code')
    expect(drifts[0]?.source).toBe(WAREHOUSE_ENDPOINT.source)
  })

  it('names a property that appeared on the live side (A3)', () => {
    const live = liveOperations(liveDocument(['code', 'id', 'nameAr']))
    const drifts = findDrift(
      [WAREHOUSE_ENDPOINT],
      { endpoints: [{ ...BASELINE.endpoints[0]!, responseProperties: ['id'] }] },
      live,
    )
    expect(drifts[0]?.message).toContain('added: code, nameAr')
  })

  it('reports a declared known divergence as no drift, so the gate stays runnable', () => {
    const drifts = findDrift(
      [WAREHOUSE_ENDPOINT],
      {
        endpoints: [],
        knownDivergences: [
          {
            path: WAREHOUSE_ENDPOINT.path,
            method: 'GET',
            source: '',
            reason: 'not implemented yet',
          },
        ],
      },
      liveOperations({ paths: {} }),
    )
    expect(drifts).toEqual([])
  })

  it('fails naming a consumed endpoint the live API no longer serves (A4)', () => {
    const empty = liveOperations({ paths: {} })
    const drifts = findDrift([WAREHOUSE_ENDPOINT], BASELINE, empty)

    expect(drifts).toHaveLength(1)
    expect(drifts[0]?.endpoint).toBe('GET /warehouses/{warehouseId}')
    expect(drifts[0]?.message).toContain('absent from the live API')
  })

  it('fails when the live API serves the path under a different method', () => {
    const document = liveDocument()
    const get = (document['paths'] as Record<string, Record<string, unknown>>)[
      '/api/v1/warehouses/{warehouseId}'
    ]
    const live = liveOperations({
      ...document,
      paths: { '/api/v1/warehouses/{warehouseId}': { delete: get?.['get'] } },
    })
    expect(findDrift([WAREHOUSE_ENDPOINT], BASELINE, live)).toHaveLength(1)
  })

  it('fails a consumed endpoint missing from the baseline, and says how to fix it', () => {
    const drifts = findDrift(
      [{ ...WAREHOUSE_ENDPOINT, path: '/sites/{siteId}' }],
      BASELINE,
      liveOperations(liveDocument()),
    )
    expect(drifts[0]?.message).toContain('not in')
    expect(drifts[0]?.message).toContain('eiams-v1.consumer-baseline.json')
  })

  it('checks existence only for a path whose method the call site never states', () => {
    const endpoint: ConsumedEndpoint = { ...WAREHOUSE_ENDPOINT, method: null }
    expect(findDrift([endpoint], BASELINE, liveOperations(liveDocument()))).toEqual([])
    expect(findDrift([endpoint], BASELINE, liveOperations({ paths: {} }))).toHaveLength(1)
  })
})

describe('baseline capture', () => {
  it('records the live fingerprint of every consumed endpoint it can match', () => {
    const baseline = toBaseline([WAREHOUSE_ENDPOINT], liveOperations(liveDocument()))

    expect(baseline).toEqual(BASELINE)
  })

  it('omits an endpoint the live API does not serve, so the baseline stays honest', () => {
    const baseline = toBaseline(
      [{ ...WAREHOUSE_ENDPOINT, path: '/nowhere' }],
      liveOperations(liveDocument()),
    )
    expect(baseline.endpoints).toEqual([])
  })

  it('merges the sources that consume the same endpoint', () => {
    const baseline = toBaseline(
      [
        WAREHOUSE_ENDPOINT,
        { ...WAREHOUSE_ENDPOINT, source: 'src/modules/reports/services/reports.service.ts' },
      ],
      liveOperations(liveDocument()),
    )
    expect(baseline.endpoints[0]?.sources).toEqual([
      'src/modules/reports/services/reports.service.ts',
      'src/modules/warehouse/services/warehouse.service.ts',
    ])
  })
})

describe('the committed baseline', () => {
  it('covers every consumed endpoint the discovery finds', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const committed = JSON.parse(
      await readFile(
        join(process.cwd(), 'contracts/openapi/eiams-v1.consumer-baseline.json'),
        'utf8',
      ),
    ) as ConsumerBaseline

    const endpoints = applicationSourceFiles()
      .filter((file) =>
        /\btransport\s*\.\s*(request|requestPage|requestEmpty)\b/u.test(readSource(file)),
      )
      .flatMap((file) => consumedEndpointsIn(readSource(file), relativeToRepo(file)))

    // Every consumed endpoint is EITHER fingerprinted or declared a known
    // divergence with a written reason. An endpoint in neither is one the gate
    // is silently ignoring, which is the only way a guard can go quiet.
    const covered = new Set(committed.endpoints.map((e) => `${e.method ?? 'ANY'} ${e.path}`))
    for (const divergence of committed.knownDivergences ?? []) {
      expect(divergence.reason.length, `${divergence.method} ${divergence.path}`).toBeGreaterThan(
        20,
      )
    }
    const declared = new Set(
      (committed.knownDivergences ?? []).map((d) => `${d.method ?? 'ANY'} ${d.path}`),
    )
    const missing = [...new Set(endpoints.map(label))].filter(
      (name) => !covered.has(name) && !declared.has(name),
    )
    expect(missing).toEqual([])
    expect(committed.endpoints.length).toBeGreaterThanOrEqual(40)
  })
})
