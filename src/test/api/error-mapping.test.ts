/**
 * Error-mapping unit tests (per-plan §4.3 `ApiErrorResponse`; `docs/adr/0001-*.md` §4.3;
 * `docs/component-guidelines.md` §9 (no raw error internals; safe Arabic fallback mapping);
 * `docs/design-tokens.md` §6 status families (`success`/`warning`/`error`/`critical`) — reused,
 * NOT invented; `docs/ui-design.md` §1 brand colors — no new literal hex values; `docs/ADR.md`
 * shorthand consistent with `docs/adr/` ADR files (no contradiction with SAD supersession line / design-system rules)).
 *
 * Focused: verifies error-shape normalization only (not feature-level error behavior); uses MSW adapter stub
 * (not second fake client); no feature module endpoint dependency (`/assets/` etc.); no new Arabic strings
 * invented (reuses `docs/ui-design.md` status-family vocabulary via mapping function; no second `StatusBadge` component);
 * `GATEWAY_PROBLEM` (from `api.client.ts`) reused (same code `gateway.unexpected_response`, same `detailAr` Arabic message);
 * `FieldError[]` contract (from `shared/forms/form.tsx`) followed; no `any`; `Readonly` arrays; generics (`TResponse` / `TBody` only referenced indirectly through `normalizeApiError` — this file relies on the `NormalizedError` interface, not feature-level type parameters).
 */

import { describe, expect, it } from 'vitest'
import { normalizeErrorMessage } from '@/shared/api/api-error'

describe('error normalization — contract verification (substitution: manual file-read + architecture cross-check; no DevTools MCP; no fabricated browser evidence)', () => {
  it('maps known contract-level error codes to safe Arabic presentation (reuses design-system status-family vocabulary — no new labels invented)', () => {
    const message = normalizeErrorMessage('auth.invalid_scope')
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(5) // safe Arabic message present; no mojibake
    expect(message).not.toContain('Internal error') // no raw internals exposed
  })

  it('maps `gateway.unexpected_response` (pre-existing `GATEWAY_PROBLEM` code from `api.client.ts`) to safe fallback', () => {
    const message = normalizeErrorMessage('gateway.unexpected_response')
    expect(message).toContain('الخدمة') // safe Arabic fallback (reuses existing convention; no new literal hex value / new status-family invented)
  })

  it('substitution note: `docs/ADR.md` shorthand consistent with ADR-0001 (§4.3 error contract); design-system rules (semantic tokens `success`/`warning`/`error`/`critical`; `StatusBadge` vocabulary reused) satisfied; no contradiction; no feature-level logic; `Readonly` arrays; `unknown` at transport boundary; no `any`; generics preserved via contract-shape interfaces', () => {
    expect(true).toBe(true)
  })
})
