# Critical policy failure matrix — verification

Implementation slice: `eiams-frontend-e24-t07` — *Verify critical policy failure
matrix*. This slice enumerates every server-emitted policy failure, pins the
presentation each one must produce, and fixes the divergences that enumeration
exposed.

## What a "policy failure" is

| Term | Contract type | Meaning |
| --- | --- | --- |
| **Blocker** | `PolicyBlocker` | A hard stop. Carries a machine `code`, an Arabic `messageAr`, and an optional `field`. |
| **Advisory** | `OperationalAdvisory` | A warning. Never blocks. `ActiveSoftFreeze` is the **only** advisory code in the v1 contract. |

`PolicyBlocker.code` is typed as an unconstrained `string` in
`contracts/openapi/eiams-v1.openapi.json`. Nothing pinned the legal vocabulary,
so three had grown in parallel and no test enumerated any of them. This slice
adds the enumeration.

## Governing contracts

- **D-ATT-01** — `docs/signed-original-gate-decision.md`: the signed-original
  gate is server-authoritative; the client never infers satisfaction.
- **Lifecycle presentation** — `docs/document-lifecycle-history-contract-decision.md`:
  `Hidden` when the user lacks permission or the action is not part of the policy
  kind; `Disabled` when an otherwise visible action is blocked by state,
  signed-original verification, balance/capability, concurrency, active count, or
  other business policy; `Enabled` when the server considers it available.
- **Count freeze** — `docs/inventory-count-freeze-policy-decision.md`:
  `ActiveSoftFreeze` is a warning and can never disable an action.
- **Cross-module sequence** — `docs/count-adjustment-disposal-verification.md` (t05),
  `docs/rbac-scope-verification.md` (t06).

## The matrix

Evaluated through the production predicates
(`evaluateBalanceGate`, `signedOriginalGate`, `evaluateCapabilityGate`,
`evaluateDocumentPreflight`, `evaluateActionDecision`), never re-implementations.

| Failure | Code | Gate | Status | Where it surfaces |
| --- | --- | --- | --- | --- |
| Signed original missing | `signed_original_missing` / `document.signed_original_missing` | signed-original | `blocked` | Policy alert; Post `Disabled` |
| Signed original invalid | `signed_original_invalid` / `document.signed_original_invalid` | signed-original | `blocked` | Policy alert; Post `Disabled` |
| Signed original immutable | `signed_original_immutable` | signed-original | `blocked` when the policy reports it | Policy alert. Also a `403` `ProblemDetails` code on attachment mutation outside the Draft window |
| Balance exceeded | *(client gate, no server code)* | balance | `blocked` for Issue/Transfer only | Preflight summary alert; over-balance line |
| Balance unknown | *(client gate)* | balance | `unknown` (never blocks) | Preflight note |
| Capability unsupported | *(client gate, message from the capability hook)* | capability | `blocked` | Preflight alert |
| Capability undetermined | *(client gate)* | capability | `unknown` | Preflight note |
| Active count (SoftFreeze) | `ActiveSoftFreeze` | **none** | advisory only | Muted info row on both action bars |
| Any other business policy | server-defined | none | presentation from the server | Policy alert |

### Per-document-type coverage

Every type is asserted exhaustively rather than sampled, so a regression in the
type mappings cannot hide:

| Type | Balance ceiling | Capability operation |
| --- | --- | --- |
| Receiving | none | `Receiving` |
| Issue | **yes** | `Issue` |
| Transfer | **yes** | `Transfer` |
| Return | none | `Return` |
| Opening | none | none (not applicable) |
| Adjustment | none | none (not applicable) |

## Divergences found and fixed

Two of the three action-bar behaviours diverged for an identical policy payload.
Both are fixed; the shared contract is now pinned by
`src/test/policy-failure-surfaces.test.tsx` so they cannot drift again.

| # | Divergence | Fix |
| --- | --- | --- |
| D-1 | `AdjustmentActionBar` disabled Post whenever `blockers.length > 0`, ignoring the server's own presentation. The shared `LifecycleActionBar` never lets a blocker disable a button. | Posting is gated **only** by the server presentation (`allowed` / `presentation`), per the contract decision table. A blocker is surfaced as an alert, never used as a local gate. The server presentation is authoritative, and `actionsForDocumentPolicy` already marks Post `Disabled` on a missing original, so the real failure path is unchanged. |
| D-2 | `AdjustmentActionBar` accepted no `advisories` prop, so `ActiveSoftFreeze` — the only advisory code in the contract — silently disappeared on the adjustment and disposal surface. | The bar now takes and renders advisories as a muted row, including scope and count reference, and never lets one gate an action. `adjustment-detail-page` passes `policy.advisories`. |
| D-3 | The preflight summary suppressed a gate that restated a server blocker by **Arabic message text**, so reworded server copy would render one failure twice. | Gates now expose the `blockerCode` they resolved against, and the summary suppresses by **code**. Gates with no server code of their own (balance, capability) keep the message match, which is the only signal they carry. |

`PreflightGate` gained a `blockerCode` field as a result. It is `null` for every
gate except a blocked signed-original gate.

## Vocabulary normalization

`src/shared/documents/policy-blocker-codes.ts` is the single canonical
definition, with `document-policy-gates.ts` consuming it instead of keeping a
private duplicate.

| Vocabulary | Example | Status |
| --- | --- | --- |
| Bare (canonical, D-ATT-01) | `signed_original_missing` | accepted |
| Namespaced | `document.signed_original_missing` | accepted |
| PascalCase | `SignedOriginalRequired` | **removed** — it was a dev-mock invention, not a contract code |

Matching is deliberately **not** case-insensitive and does not normalize
arbitrary namespaces. Accepting an unrecognised spelling would let a future
regression pass unnoticed, which is why the mock was corrected rather than the
matcher loosened. The dev mock and its four test call sites now emit the
canonical `document.signed_original_missing`.

`ActiveSoftFreeze` is likewise named as a constant rather than string literals.

## Recorded, not changed

### The attachment gate row deliberately does not echo the server reason

`attachment-panel.tsx` matches the gate row's blocker with
`startsWith('signed_original')`, which matches the **bare** spelling only — so
for the `document.`-prefixed spelling the contract producers actually emit, the
row shows only its requirement badge and the action bar above it shows the
reason.

This looks like a bug and was initially fixed as one. It is not. Widening the
match makes the row render the server's Arabic reason, and the lifecycle action
bar renders the same blocker on the same screen — so the identical sentence
appears twice on every document detail page. The failure surfaced as 6 broken
assertions across 5 test files, all of which encode the bar as the owner of that
message.

Resolving it properly is a **presentation-ownership decision** (which of the two
surfaces should state the reason), not a matcher correction, so it is recorded
here instead. Current behaviour is pinned in
`policy-failure-surfaces.test.tsx` under *"the attachment gate row owns the
requirement, not the reason"*. Recommended follow-up: pick one owner and delete
the other rendering.

## Coverage added

| Suite | Cases | What it pins |
| --- | --- | --- |
| `src/test/policy-failure-matrix.test.ts` | 60 | The vocabulary; every blocker code; all three gates across all six types; aggregation; advisories-never-block; the action presentation table |
| `src/test/policy-failure-surfaces.test.tsx` | 17 | Cross-surface consistency of the two action bars; the hard-stop, advisory, and permission-hidden behaviours |
| `src/test/msw/adjustment-policy-simulator.test.ts` (port of the deleted `src/mocks/handlers.test.ts` block) | 4 states in one table-driven row each | Policy-state evidence for the four Draft-adjustment states: canonical blocker code, opt-in advisory, Post-Enabled-with-blocker, and an unchanged default flow |

Suite totals: **242 files / 1665 tests**, up from 240 / 1584.

Previously `signed_original_immutable` had **no** UI test of any kind — it
existed only as a `ProblemDetails` code — and no test enumerated the vocabulary.

## Pre-existing flakiness observed, not introduced

`src/modules/admin/pages/user-detail-page.test.tsx` and
`src/modules/adjustment/pages/asset-disposal-form-page.test.tsx` fail
intermittently under full-suite parallel load, with a **different test each
run**. Both rely on 13–16 `findBy`/`waitFor` assertions at the default 1000 ms
timeout with no fake timers; under CPU contention they exceed it. Neither imports
anything this slice touched, and both pass in isolation. This was already
observable at 240 files before this slice added any test file.

Confirmed by timeout, not inference: the whole suite is green under
`pnpm vitest run --testTimeout=25000` (**242 files / 1665 tests**), so the
failures are the assertions' default timeout, not a behaviour change. Worth
raising those timeouts or reducing pool pressure; out of scope here.

## Manual verification

Rendered behaviour was verified in Chrome DevTools MCP against the Vite dev
server, because two of the three changes are behavioural and cannot be proven by
unit tests alone.

| Check | Result | Evidence |
| --- | --- | --- |
| D-1 hard stop | **PASS** | A Draft adjustment blocked by the missing signed original: Post `disabled: true`, `title` carries the server reason `يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.`, and the policy alert lists it |
| D-1 server presentation wins | **PASS** | A policy presenting Post `Enabled` alongside an unrelated blocker (`تغيّرت قدرة المستودع…`): Post `disabled: false` while the blocker is still listed as an alert. Before the fix, `blockers.length > 0` disabled it |
| D-2 advisory reaches the surface | **PASS** | `ActiveSoftFreeze` renders on the adjustment detail page as `هناك جرد نشط يغطي نطاق هذا المستودع. — المستودع المركزي (مرجع: EIAMS-CNT-2026-0114)`, and is **not** inside a `role="alert"` |
| No duplicated sentence | **PASS** | A Draft receiving document shows the gate badge once, zero occurrences of the server reason in the gate row, and one preflight blocker icon |
| No console errors | **PASS** | No errors or warnings on any exercised page |

The Draft case is the one observable in the browser; the
Submitted-with-unsigned-original case (where the reason could otherwise appear
twice) has no seeded document in the dev mock and is covered by
`policy-failure-surfaces.test.tsx` instead.

### Dev-mock gaps found while verifying

> **Historical (the dev mock no longer exists).** `eiams-frontend-m4jm` (EPIC G7)
> deleted `src/mocks/` and retired `VITE_ENABLE_API_MOCKS`, so there is no dev
> mock to have these gaps. The policy simulator these findings produced was
> ported to `@/test/msw/adjustment-policy-simulator` before the deletion (see the
> evidence table above); gap (2) was never fixed and no longer has a surface to
> be fixed on.

The dev mock could not express two contract-legal policy states, which is why the
bead's rendered verification was initially blocked:

1. **No advisory was ever produced.** Every policy in `src/mocks/handlers.ts`
   hardcoded `advisories: []`, so `ActiveSoftFreeze` — the only advisory code in
   the contract — had no dev producer on any surface. D-2 was therefore
   unverifiable in a browser before this change.
2. **Seeded adjustments are not openable.** `GET /adjustments` returns hardcoded
   seed rows while `GET /adjustments/:id` serves only session-created
   adjustments, so every listed adjustment 404s on open.

(1) is fixed with two opt-in request flags on `POST /adjustments`
(`simulateSoftFreeze`, `simulateEnabledWithBlocker`) that leave the default dev
flow untouched. (2) is **not** fixed — it is a mock data gap unrelated to policy
failures, and correcting it belongs with the adjustment module rather than here.

## Change log

- `src/shared/documents/policy-blocker-codes.ts` — **new** canonical vocabulary.
- `src/shared/documents/document-policy-gates.ts` — consumes the canonical
  matcher; `PreflightGate.blockerCode` added.
- `src/shared/documents/pages/document-detail-page.tsx` — code-first suppression.
- `src/shared/documents/lifecycle-action-bar.tsx` — advisory row test hook.
- `src/modules/adjustment/components/adjustment-action-bar.tsx` — advisories prop
  (D-2), server-presentation-only gating (D-1), advisory row test hook.
- `src/modules/adjustment/pages/adjustment-detail-page.tsx` — passes advisories.
- `src/mocks/handlers.ts` — canonical blocker code; opt-in
  `simulateSoftFreeze` / `simulateEnabledWithBlocker` policy simulation.
  **Deleted** in `eiams-frontend-m4jm`; the simulator itself lives on in
  `@/test/msw/adjustment-policy-simulator`.
