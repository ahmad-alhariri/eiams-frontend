import { afterEach } from 'vitest'

import { createAxiosTransport } from '@/shared/api/axios-transport'
import type { ApiTransport } from '@/shared/api/api-transport'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'

/**
 * Builds a real `ApiTransport` over a throwaway Axios client for service tests.
 *
 * WHY THIS EXISTS. `eiams-frontend-9uuf` was a transport defect hidden by a
 * cast. Five service tests reached the singleton through
 *
 *     setCatalogService(bundle.client as unknown as Parameters<typeof createCatalogService>[0])
 *
 * An `AxiosInstance` exposes `get/post/put/delete/patch/request` but NOT
 * `requestPage/request/requestEmpty`, so the cast satisfied TypeScript while
 * defeating the only check that could have caught the missing production
 * wiring. The suite stayed green and the application threw
 * `TypeError: transport.requestPage is not a function` on its first list call.
 *
 * Wrapping the same test client in `createAxiosTransport` keeps MSW
 * interception working while giving the service the three-method interface it
 * actually requires, so a missing method is now a compile error and a missing
 * runtime object is a failing test rather than a silent cast.
 */
export interface TestTransportHarness {
  /** A real transport over an isolated Axios client. */
  readonly transport: ApiTransport
  /** The underlying bundle, for tests that need the raw Axios instance. */
  readonly bundle: ApiClientBundle
  /** Ejects the client's interceptors. Call from `afterEach`. */
  readonly dispose: () => void
}

export function createTestTransportHarness(baseURL = '/api/v1'): TestTransportHarness {
  const bundle = createApiClient({ baseURL })

  return {
    transport: createAxiosTransport(bundle.client),
    bundle,
    dispose: bundle.dispose,
  }
}

const activeHarnesses = new Set<TestTransportHarness>()

/**
 * Registers one harness per test and disposes it afterwards, so a test file
 * does not repeat the `bundles` array and `afterEach` loop that five service
 * suites previously duplicated verbatim.
 */
export function registerTestTransportHarness(baseURL = '/api/v1'): () => TestTransportHarness {
  afterEach(() => {
    for (const harness of activeHarnesses) {
      harness.dispose()
    }
    activeHarnesses.clear()
  })

  return () => {
    const harness = createTestTransportHarness(baseURL)
    activeHarnesses.add(harness)
    return harness
  }
}
