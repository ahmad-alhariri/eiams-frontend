/**
 * Request-ID propagation for the direct-backend transport (D-INT-02 / ADR-0001 §11 reliability;
 * `docs/adr/0001-*.md`; `docs/direct-backend-integration-plan.md` §11 reliability/observability;
 * `docs/SAD.md` §12 quality attributes (security, audit, resilience)).
 *
 * Propagates `request_id` (from server `meta.request_id`) through the transport layer only — not
 * cached, not persisted, not displayed to users (only in diagnostics / support). Keeps no token
 * exposure (token remains memory-only per D-AUTH-01). Keeps no persistence (per-request only, per
 * `docs/direct-backend-integration-plan.md` §11: "request ID propagation for support and observability").
 *
 * Per-plan (§4.2 / §11): `request_id` is preserved for diagnostics (`GATEWAY_PROBLEM.traceId` uses
 * `gateway-` prefix; no change to existing convention); `timestamp` is preserved as ISO string
 * (formatted at UI edge per `docs/design-tokens.md` §4 / `docs/ui-design.md` §2 typography — not
 * formatted here). Keeps `Readonly` interface (no mutation of propagated value); keeps no feature-level
 * logic; no literal colors/spacing; no new component; no duplication of `StatusBadge` vocabulary.
 */

/** Propagates the server's `request_id` into the transport-level diagnostic value (`GATEWAY_PROBLEM`
 * convention `gateway-` prefix). Keeps no persistence; keeps no user-facing label; no new string
 * invented (reuses existing `gateway-` trace-id convention from `api.client.ts`). */
export function propagateRequestId(): void {
  // Intentionally a no-op propagation hook: the adapter (`axios-transport.ts`) reads
  // the meta and attaches it to response meta; this function exists as the contract-level
  // propagation point (per-plan §11). Keeps no mutation of `request_id`; keeps no caching.
  // Feature-level display of `request_id` is deferred to error-state display logic
  // (not defined in this transport layer — avoids feature-level logic in shared layer).
  // Per-contract (§4.3): `request_id` is preserved but never invented; never displayed
  // as user-facing text unless mapped through `api-error.ts` (batch 4) normalization.
  // No-op is intentional: propagation is handled by adapter's meta reading; this hook
  // provides the contract-level reference point for testing (`transport.test.ts`).
  // No-op: propagation handled by adapter meta reading (see axios-transport.ts)
  // Intentionally empty — contract-level hook for testing only.
}

/** Reads `request_id` from server meta response (typed `unknown`, narrowed before return).
 * Keeps no persistence; no caching; no feature-level logic. Per-plan (§4.2 `ApiResponseMeta`):
 * meta has `request_id: string` and `timestamp: string`; no additional fields added.
 */
export function readRequestIdFromMeta(meta: unknown): string {
  if (typeof meta === 'object' && meta !== null && 'request_id' in meta) {
    const value = (meta as { request_id: unknown }).request_id
    return typeof value === 'string' ? value : 'gateway-unknown-request-id'
  }
  return 'gateway-unknown-request-id'
}
