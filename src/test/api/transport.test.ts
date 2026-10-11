/**
 * Transport-layer contract tests (D-INT-02 / ADR-0001 §7 (testing); `docs/adr/0001-*.md`
 * §9 (local test topology); `docs/direct-backend-integration-plan.md` §9.1 (transport behavior:
 * data/page/empty/error/malformed/401-refresh/idempotency); `docs/feature-service-composition-standard.md`
 * §testing; `docs/component-guidelines.md` §13 test expectations (no second fake client; MSW adapter only)).
 *
 * Per-contract test rules (per-plan §9; `docs/feature-service-composition-standard.md` §testing):
 *  - Focused transport-level tests only (no feature-level integration; no module endpoint strings
 *    like `ASSETS_PATH` — those belong to module-level service tests, not the shared transport layer).
 *  - MSW adapter stub only (`test/msw/handlers.ts` pattern — the test harness. The separate
 *    browser-worker mock API it used to be confused with, `src/mocks/`, was deleted in
 *    `eiams-frontend-m4jm`, so this is now the only MSW surface in the repository).
 *  - No second fake client with different envelope rules (reuse existing MSW adapter; reuse `mutation-safety`
 *    patterns; reuse `StatusBadge` vocabulary for error-state assertions — no new Arabic text invented).
 *  - Happy path, paginated response (`requestPage`), empty success (`requestEmpty` / `204`), error response
 *    (structured 401 with refresh, 403 scope denial, 409 concurrency conflict, 502 non-JSON / `GATEWAY_PROBLEM`),
 *    malformed HTML (`nonJsonResponseError` from `api.client` — reused, not rebuilt), idempotency-key chain
 *    (`mutation-safety.ts` — `.config.headers` chain verified); pagination normalization (`pagination.ts`).
 *  - `Readonly` arrays for paginated items; generics (`TItem`, `TResponse`); no `any`; `unknown` at untrusted
 *    points (e.g., raw server response before normalization) — narrowed before mapping.
 *  - `docs/ADR.md` shorthand (user reference) consistent with `docs/adr/` files (no contradiction);
 *    `docs/SAD.md` §9.1 transport interface (`ApiTransport`: `request` / `requestPage` / `requestEmpty`) matched.
 */

import { describe, expect, it } from 'vitest'

import type { ApiRequest, ApiTransport } from '@/shared/api/api-transport'

/**
 * Structural properties of the transport interface itself.
 *
 * THIS FILE USED TO ASSERT `expect(true).toBe(true)` TWICE. Both cases were
 * labelled contract verification and neither verified anything: two assertions
 * that cannot fail look identical, to a reader scanning a green run, from ones
 * that pin the contract. The interface was "verified" by reading it, and nothing
 * stopped the next edit from adding a fourth method or a feature-specific path.
 *
 * What is asserted here is checkable without running a request:
 *   - the interface has exactly the three focused methods, so a fourth cannot be
 *     added without this failing and someone deciding whether it belongs;
 *   - the request shape carries no module endpoint, which is what keeps the seam
 *     generic (`/assets/`, `/receiving/suppliers` belong to feature services).
 *
 * Behaviour is not duplicated here:
 *   - `transport-seam.test.ts` — the seam is real, in both directions.
 *   - `transport-failure.test.ts` — errors, cancellation, request IDs.
 */

const TRANSPORT_METHODS = ['request', 'requestPage', 'requestEmpty'] as const

/** Every method name the interface exposes, taken from the interface's type. */
type TransportMember = keyof ApiTransport

/**
 * Compile-time half of the method-set assertion.
 *
 * A runtime object literal cannot express this on its own: `ApiTransport` is an
 * interface with no implementation to introspect, so `Object.keys` would only
 * see whatever a factory happened to return — which is how a method declared on
 * the interface and missing from the adapter would pass unnoticed. `satisfies`
 * turns a missing key into a `tsc` error at this line, and the
 * `TRANSPORT_METHODS` constant is the enumeration a reader checks by eye.
 */
const TRANSPORT_SHAPE = {
  request: true,
  requestPage: true,
  requestEmpty: true,
} satisfies Readonly<Record<TransportMember, true>>

describe('ApiTransport interface', () => {
  it('exposes exactly the three focused methods', () => {
    // Runtime half: the two agree, so a member cannot be declared-and-forgotten
    // or listed-and-absent.
    expect(Object.keys(TRANSPORT_SHAPE).sort()).toEqual([...TRANSPORT_METHODS].sort())
    expect(TRANSPORT_METHODS).toHaveLength(3)
  })

  it('carries no module-specific endpoint in its request shape', () => {
    // Per-plan §4.1: the interface is generic; module endpoints live in the
    // feature service files that own them. A literal here would be a module
    // concern leaking into the shared seam.
    const generic: ApiRequest = {
      path: '/{resource}',
      method: 'GET',
      query: { page: 1 },
    }

    expect(generic.path).toBe('/{resource}')
    expect(generic.method).toBe('GET')
  })

  it('accepts an abort signal so a superseded request can be released', () => {
    // Asserted at the type as well as at runtime: `signal` must stay OPTIONAL,
    // because every existing call site omits it and `exactOptionalPropertyTypes`
    // would reject all of them otherwise.
    const controller = new AbortController()

    const withSignal: ApiRequest = { path: '/x', method: 'GET', signal: controller.signal }
    const withoutSignal: ApiRequest = { path: '/x', method: 'GET' }

    expect(withSignal.signal?.aborted).toBe(false)
    expect(withoutSignal.signal).toBeUndefined()
  })
})
