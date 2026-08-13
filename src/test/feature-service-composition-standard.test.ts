import compositionStandard from '../../docs/feature-service-composition-standard.md?raw'
import mutationSafetySource from '../shared/services/mutation-safety.ts?raw'
import queryKeysSource from '../shared/services/query-keys.ts?raw'
import factoriesSource from './msw/factories.ts?raw'
import { describe, expect, it } from 'vitest'

describe('feature service composition standard', () => {
  it('documents the required service, query, mutation, and test boundaries', () => {
    expect(compositionStandard).toContain('createFeatureService(client: AxiosInstance)')
    expect(compositionStandard).toContain('satisfies keyof paths')
    expect(compositionStandard).toContain('queryKeys.public(resource, ...parts)')
    expect(compositionStandard).toContain(
      'queryKeys.scoped(activeScopeCacheKey, resource, ...parts)',
    )
    expect(compositionStandard).toContain('normalizeApiError(error)')
    expect(compositionStandard).toContain('isConflictError(error)')
    expect(compositionStandard).toContain('createIdempotentRequest()')
    expect(compositionStandard).toMatch(/withRowVersion\(payload,\s+rowVersion\)/u)
    expect(compositionStandard).toContain('src/test/msw/factories.ts')
  })

  it('references the shared implementations that enforce the documented seams', () => {
    expect(mutationSafetySource).toContain('export function createIdempotentRequest')
    expect(mutationSafetySource).toContain('export function withRowVersion')
    expect(mutationSafetySource).toContain('export function isConflictError')
    expect(queryKeysSource).toContain('public: (resource: string')
    expect(queryKeysSource).toContain('scoped: (scope: ScopeCacheKey')
    expect(factoriesSource).toContain('export function createProblemDetails')
    expect(factoriesSource).toContain('export function createPage')
  })

  it('forbids service-level responsibilities that would bypass shared infrastructure', () => {
    expect(compositionStandard).toMatch(/must not create an\s+Axios instance/u)
    expect(compositionStandard).toMatch(
      /do\s+not mirror server records into Zustand\s+or local component state/u,
    )
    expect(compositionStandard).toMatch(/Do not add a\s+global Axios retry interceptor/u)
    expect(compositionStandard).toMatch(/never call Axios,\s+encode endpoint URLs/u)
  })
})
