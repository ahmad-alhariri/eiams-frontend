# EIAMS Frontend Architecture Readiness Review

**Status:** Approved — architecture and provisional contract are ready to
unblock the implementation epics, with three tracked increments below.
**Beads:** `eiams-frontend-e01-t08`
**Review date:** 2026-08-09

## 1. Purpose

This review is the final gate of the *Architecture and contract decisions*
epic. It verifies that every approved P0 decision (D-OAS-01/02, D-AUTH-01,
D-LIFE-01, D-ATT-01, D-AUD-02, D-RBAC-01, D-ADJ-01, D-ICF-01, D-POST-01,
D-RAE-01) is consistently represented in the admitted provisional OpenAPI
snapshot and its provenance, and that the frontend can begin implementation
without guessing business rules.

## 2. Method

- Read the decision artifacts and the requirements-conflict-matrix baseline.
- Inspected `contracts/openapi/eiams-v1.openapi.json` (78 paths, 112
  operations, 141 schemas) and the companion provenance
  (`1.0.0-provisional.3`; Redocly zero warnings; `openapi-typescript`
  generated 5428 lines; zero missing schema references; zero duplicate
  operation IDs).
- Verified each decision's required contract surface against actual schemas,
  operations, and error shapes (evidence cited in §4).
- Quality gates (`npm run lint`, `npm run typecheck`, Vitest/MSW) are not yet
  runnable in this repository — there is no scaffold at this stage by design
  (scaffold is `e02`, unblocked by this review). This review therefore judges
  architecture and contract readiness; tooling gates move to the e02 tasks.

## 3. Verdict

**READY with tracked increments.** The provisional contract represents the
approved business semantics closely enough to unblock the e02 foundation and
the feature graph, on two conditions:

1. three increment items below are scheduled into the next snapshot revision
   (F-01, F-02) or materialized as seed data (F-04); and
2. backend ratification (`eiams-frontend-e01.7`) remains a mandatory
   production-integration gate and the only authority for changing the
   versioned contract.

No open decision is missing from the snapshot except those three
non-blocking items; no feature implementation can begin that depends on them
deliberately (audit service `e22-t07` is P2 and lands after the revision).

## 4. Area verdicts and evidence

| Area | Decision | Verdict | Evidence |
| --- | --- | --- | --- |
| Contract provenance and publication gate | D-OAS-01/02 | PASS | Stable `operationId` on every operation; snapshot admitted with provenance, digests, generation output, and explicit ratification policy (`e01.7`). |
| Authentication, session, active scope | D-AUTH-01 | PASS | `bearerAuth` (JWT, memory-only) + `eiams_refresh` cookie scheme (Secure/HttpOnly/SameSite=Strict, Path=/api/v1/auth); `SessionResponse` (`user`, `availableScopes`, `scopeState`, optional `activeScope`, `activeRoles`, `permissionCodes` unique array); refresh bodyless; logout idempotent; `AuthErrorCode` exact 7-code set; Enterprise `scopeId` nullable (`NullableUuid`). |
| Document lifecycle, actions, history | D-LIFE-01 | PASS | `LifecyclePolicyKind` (Generic/Adjustment/Disposal); `ActionPresentation` (Hidden/Disabled/Enabled); typed `DocumentActionType` incl. `Edit`, `Revise`, `UploadAttachment`, `DeleteAttachment`; `LifecycleEventType` = Created/Submitted/Posted/Rejected/RevisionStarted/Cancelled/Reversed (no `Updated`, no `Approved`); event carries actor snapshot, `documentRowVersion`, `correlationId`, `relatedDocument`; `GET …/history`, `GET …/policy`; version-only and reason-required request bodies; `LifecycleConflictProblemDetails`. |
| Signed-original attachment gate | D-ATT-01 | PASS with increment (F-01) | `DocumentPolicy.signedOriginalSatisfied`, `blockers[]` with machine code + `messageAr`, `advisories[]`; upload multipart with `rowVersion`, delete draft-only, list with `checksum`/`uploadedBy`/`uploadedAt`/`downloadUrl`. Gate blocker codes and satisfier summary are not yet in the snapshot schema (F-01). |
| Audit detail and redaction | D-AUD-02 | CONDITIONAL PASS with increment (F-02) | `AuditLog`/`AuditLogEntry`/`AuditLogPage` with `redacted`, `redactionReasonAr`, `summaryAr`, `traceId`, filters (`entityType`, `entityId`, search, date range). Three gaps: list returns entries inline (must be header-only), `fieldLabelAr` missing, audit action untyped. |
| Route/permission/scope matrix | D-RBAC-01 | PASS (seeds pending) | `SessionResponse.permissionCodes` open string array; `/admin/permissions` catalog with `code`/`nameAr`/`descriptionAr`; user/role endpoints and role-scope replacement. The canonical v1 code list and seed roles must materialize in `/admin/permissions` + role seeds (F-03, `e01.7`). |
| Adjustment and disposal | D-ADJ-01 | PASS | `AdjustmentPurpose` (CountVariance/DirectCorrection/Disposal); `AdjustmentStatus` (Draft/Posted/Reversed); dedicated `/adjustments` lifecycle (create/update/post/reverse) outside the submit/reject loop; `listDisposalEligibleAssets`. |
| Count freeze policy | D-ICF-01 | PASS | `FreezePolicy` enumerates `SoftFreeze` only; count lifecycle (plan/start/lines/complete/close) present in provisional opIds. |
| Return & asset event semantics | D-RAE-01, D-AST-02 | PASS | `StockMovementType` includes canonical `Receipt` (no `Return` movement enum); `AssetMovement` only Received/Issued/Returned/Disposed; `AssetDerivedStatus` server-side (InStock/Issued/InCustody/Disposed). |
| Polymorphic counterparts | D-POST-01 | PASS | `CounterpartType` (Employee/OrganizationalUnit/Site/External); `CounterpartOption`, `searchCounterparts`, `resolveCounterpart`, ExternalParty CRUD + deactivate. |
| Shared document/draft surface | D-ATT-01, D-OPEN-01 | PASS | Document draft create/update with lines incl. `AssetInput`, `OpeningType` (Initial/Correction), petals (`ReceivingInfo`/`IssueTo`/`TransferInfo`/`ReturnInfo`), attachments operations. |
| Pagination, errors, formats | D-OAS-01 (cross-cutting) | PASS | `PageMeta` (pageIndex/pageSize/totalItems/totalPages); `ProblemDetails` (status/code/titleAr/detailAr/traceId/fieldErrors); `LifecycleConflictProblemDetails`; UUID identity; decimal/date usage. |
| RBAC/export seed surface | D-RBAC-01 | INFO → ACTION (F-03) | Permission vocabulary and role seeds are not contract-enforced by enums; seed materialization is backend-owned at `e01.7`. |

## 5. Findings register

| ID | Severity | Finding | Reason it does not block | Owner / action |
| --- | --- | --- | --- | --- |
| F-01 | Medium | `DocumentPolicy` lacks the satisfier summary required by D-ATT-01 (`satisfyingSignedOriginal`: identity/metadata of the satisfier attachment) | The boolean `signedOriginalSatisfied` + blockers already support the v1 UI and gate flows; the summary is a display/audit nicety | Snapshot revision → `e01.6`/`e01.7`; consumed by `e04-t13` when available |
| F-02 | Medium | Audit surface deviates from D-AUD-02: `AuditLogPage` items embed `entries`; no `AuditAction` enum; no `fieldLabelAr` | Audit features are P2 (`e22-t07`); mocks can be regenerated before that starts | Snapshot revision (`e01.6`); validated at `e01.7` |
| F-03 | Low | `/admin/permissions` and role seeds are not yet seeded with the D-RBAC-01 canonical code list and Arabic labels; a permission picker must not render an empty catalog | Codes are consumed as strings; guards use the session's `permissionCodes`, so the UI works regardless | Backend seeds at `e01.7`; `e22-t06` renders whatever `/admin/permissions` returns |
| F-04 | Info | `ProblemDetails.titleAr` example literal is mojibake (broken encoding) in the snapshot | Examples are not a semantics source; generation succeeds and labels come from `titleAr` at runtime | Snapshot housekeeping at the next revision; Arabic copy in UI never generated from that example |
| F-05 | Info | Run-time gates cannot execute until the scaffold (`e02-t01…-t10`) exists | Architecture readiness is contract-level by design; code-level gates are owned by the e02 pipeline | `e02` tasks; `e01-t08` registers the expectation |

## 6. What this review unblocks

- `e02` foundation epic (scaffolding, stack, TypeScript boundaries, lint/prettier,
  tokens/RTL root, test harness, MSW baseline, CI workflow, typed env,
  reproducibility) — first task `eiams-frontend-e02-t01`.
- All downstream ordering tasks `e03…` no longer wait on a contract decision.
- Docs consuming the decisions, including the conflict matrix additions for
  D-ATT-01, D-AUD-02, D-RBAC-01, can start their services and mocks from the
  provisional snapshot with regeneration after increment items land.

## 7. Remaining gates (not resolved here)

| Gate | Owner | Meaning |
| --- | --- | --- |
| Backend ratification of the provisional snapshot | `eiams-frontend-e01.7` | Every divergence is a versioned contract change, never a frontend patch. |
| Publication/revision of increment items F-01–F-03 | `e01.6` (or backend revision) | Versioned snapshot update + regeneration. |
| Production security review | Release process | Token lifetimes, upload allowlist/size values, redaction allowlist, audit retention. |
| Runtime quality gates | e02 pipeline | lint/typecheck/tests as implemented by the foundation epic. |

## 8. Conclusion

The architecture workstream has reached definition-of-done for the frontend:
one admitted, provenance-backed provisional contract; the full approved
decision set (D-OAS-01/02, D-BDM-01, D-POST-01, D-RAE-01, D-ADJ-01, D-ICF-01,
D-AUTH-01, D-LIFE-01, D-ATT-01, D-AUD-02, D-RBAC-01); one
consistency/verification review; conflict matrix current. The
next implementation work (e02) can begin against the provisional snapshot,
respecting the increments and the ratification gates above. The repository
contains only documentation at this commit — no code changed in this bead.

---

Appendices:

- Contract: `contracts/openapi/eiams-v1.openapi.json` + `…provenance.json`
- Decisions: `docs/*-decision.md`; BDM `docs/business-domain-model-v1.md`;
- Baseline: `docs/requirements-conflict-matrix.md`; plan: `docs/ERD.md`,
  `docs/schema.md`, `docs/SAD.md`, `docs/ui-design.md`.