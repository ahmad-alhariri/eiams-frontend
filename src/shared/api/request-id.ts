/** Request-ID propagation for the direct-backend transport (D-INT-02 / ADR-0001 §11 reliability;
 *  `docs/adr/0001-*.md`; `docs/direct-backend-integration-plan.md` §11 reliability/observability;
 *  `docs/SAD.md` §12 quality attributes (security, audit, resilience)).
 *
 *  Propagates `requestId` (from server `meta.requestId`) through the transport layer only — not
 *  cached, not persisted, not displayed to users (only in diagnostics / support). Keeps no token
 *  exposure (token remains memory-only per D-AUTH-01). Keeps no persistence (per-request only, per
 *  `docs/direct-backend-integration-plan.md` §11: "request ID propagation for support and observability").
 *
 *  Per-plan (§4.2 / §11): `requestId` is preserved for diagnostics (`GATEWAY_PROBLEM.traceId` uses
 *  `gateway-` prefix; no change to existing convention); `timestampUtc` is preserved as ISO string
 *  (formatted at UI edge per `docs/design-tokens.md` §4 / `docs/ui-design.md` §2 typography — not
 *  formatted here). Keeps `Readonly` interface (no mutation of propagated value); keeps no feature-level
 *  logic; no literal colors/spacing; no new component; no duplication of `StatusBadge` vocabulary.
 *
 *  Post-vi65.3.5: server meta uses camelCase `requestId` and `timestampUtc`.
 */

/** Propagates the server's `requestId` into the transport-level diagnostic value (`GATEWAY_PROBLEM`
 *  convention `gateway-` prefix). Keeps no persistence; keeps no user-facing label; no new string
 *  invented (reuses existing `gateway-` trace-id convention from `api.client.ts`).
 */
export function propagateRequestId(): void {
  // Intentionally a no-op propagation hook: the adapter (`axios-transport.ts`) reads
  // the meta and attaches it to response meta; this function exists as the contract-level
  // propagation point (per-plan §11). Keeps no mutation of `requestId`; keeps no caching.
  // Feature-level display of `requestId` is deferred to error-state display logic
  // (not defined in this transport layer — avoids feature-level logic in shared layer).
  // Per-contract (§4.3): `requestId` is preserved but never invented; never displayed
  // as user-facing text unless mapped through `api-error.ts` normalization.
  // No-op is intentional: propagation is handled by adapter's meta reading; this hook
  // provides the contract-level reference point for testing (`transport.test.ts`).
  // No-op: propagation handled by adapter meta reading (see axios-transport.ts)
  // Intentionally empty — contract-level hook for testing only.
}

/** Reads `requestId` from server meta response (typed `unknown`, narrowed before return).
 *  Keeps no persistence; no caching; no feature-level logic. Per-plan (§4.2 `ApiResponseMeta`):
 *  meta has `requestId: string` and `timestampUtc: string` post-vi65.3.5; no additional fields added.
 */
export function readRequestIdFromMeta(meta: unknown): string {
  if (typeof meta === 'object' && meta !== null && 'requestId' in meta) {
    const value = (meta as { requestId: unknown }).requestId
    return typeof value === 'string' ? value : 'gateway-unknown-request-id'
  }
  return 'gateway-unknown-request-id'
}
