# EIAMS Frontend Requirements Conflict Matrix

**Status:** Authoritative frontend-planning baseline  
**Owner:** Architecture and contract decisions workstream  
**Beads:** `eiams-frontend-e01-t01`

## Purpose and authority

This document gives frontend planning one reproducible interpretation of the
existing EIAMS sources. It does not rewrite product, backend, ERD, or API
contracts. When a source conflict cannot be resolved from the hierarchy below,
the frontend must not infer a behavior; the referenced blocking Bead owns the
decision.

The source order for this matrix is:

1. The current Beads task and its approved scope.
2. PRD Chapter 9 (settled decisions) and Chapter 10 (Schema v5), which the PRD
   explicitly designates as governing ambiguous text.
3. SAD.
4. ERD.
5. `ui-design.md`.
6. `AGENTS.md`.
7. Existing project architecture.

`design-tokens.md` is the canonical token vocabulary within UI guidance.
Architecture choices in the SAD override historical UI-library references in
older documents.

## Adopted frontend baseline

| Area | Governing decision | Required frontend behavior | Compatibility impact | Affected Beads |
| --- | --- | --- | --- | --- |
| Authority | PRD §2 and §§9–10 govern ambiguous or superseded PRD prose. SAD governs the approved frontend stack. | Cite this matrix in contract and feature decisions; do not resolve a conflict locally in a page or component. | Earlier PRD, ERD, schema, and UI text is informative only when consistent. | `e01-t02`–`e01-t08` |
| UI primitives and icons | SAD §3.1 specifies shadcn-generated **Base UI** primitives and Tabler icons; it expressly classifies Mantine, Radix-only, and Lucide references as historical. | Shared UI work uses Base UI composition and Tabler. Do not add Mantine, Radix-only primitives, or Lucide to satisfy historical examples. | `ui-design.md` §§10–11 is not a dependency-installation specification. | Foundation/design-system epics after `e01-t08` |
| Tokens and RTL | `design-tokens.md`, SAD, and `AGENTS.md` require tokenized styles, Arabic-first UI, `dir=rtl`, and logical Tailwind properties. | Use the shared tokens and logical start/end utilities; sidebar is on the right. | Physical left/right examples in older UI guidance must be mirrored or replaced with logical properties. | Design-system, shell, navigation work |
| Generic document lifecycle | PRD D-WF-01, `AGENTS.md`, and D-LIFE-01: `Draft → Submitted → Posted → Reversed`; rejection is durable and returns to Draft only through explicit Revise; cancellation is pre-posting only. Keeper creates/submits; manager posts. | Consume the server-owned policy and immutable actual-event history. Gate actions by state, permission, and scope; never infer events or insert pending/Approved milestones. | PRD §5 keeper-post prose, ERD `Draft → Posted`, and the historical UI Approved step are superseded. | `e01-t04`, `e01-t07`, shared lifecycle action/timeline tasks |
| Signed original | PRD D-DOC-01 and §10: `SignedOriginal` is distinguished from `Supporting`; a posted document requires a signed copy. | Prevent Post until the API confirms a valid signed-original attachment. Do not rely on filename, client-only upload state, or a generic attachment count. | Verification state/endpoint is not defined; see unresolved item U-03. | `e01-t05`, attachment panel, policy-gate coordinator |
| Catalog hierarchy | PRD D-CAT-01/§10: material family is mandatory; category/domain are derived through Family → Category → Domain; kind/tracking are authoritative on Material. | Forms require a family; display derived category/domain; capability checks use the material’s derived domain. | ERD/schema nullable `family_id` and family-level kind/tracking inheritance are stale. | Catalog, warehouse capability, receiving, inventory |
| Material classification and custody | D-MAT-01: Consumable is Quantity/no asset number/no custody; Durable is Quantity or Serial/no asset number/mandatory custody; Asset is Serial/internal asset number/mandatory custody and registry. A serial number is not an asset number, and Asset is accounting classification. | Derive asset-number behavior from kind; prohibit impossible combinations and prevent kind/tracking change after first movement. Consume the provisional `MaterialQuantity`/`TrackedUnit` Custody union; do not represent Durable as Asset. | Historical `requires_asset_number` toggles, family-level tracking, and asset-only custody diagrams are stale. Backend/API-owner ratification of the provisional Durable custody contract remains required. | `eiams-frontend-bt60`, `e10-t09`, `e01-t02`, `e19-t01`â€“`e19-t09` |
| Material unit conversion | D-UOM-01: every Material owns one base unit; an alternate unit converts directly to it with a positive, per-material `DECIMAL(18,6)` factor. Posted lines retain conversion/factor/base-quantity snapshots. | Show and mutate only generated, material-scoped conversion data. Never use a global Carton/Box/Bag factor, a conversion chain, or a browser-calculated historical rewrite. | Earlier family/warehouse base-unit fields, nullable/global conversion sketches, and DocumentLine rows without snapshots are superseded. Backend/API-owner ratification of the provisional surface remains required. | `eiams-frontend-vded`, `e10-t11`, `e01-t02` |
| Stock ledger and balance | PRD D-MOV-01: append-only `quantity_delta` only; balance is a cached sum with concurrency protection. | Present signed deltas and never model client-side before/after values as authoritative. Mutations invalidate/refetch contract balances. | ERD/schema `quantity`, `quantity_before`, and `quantity_after` fields are stale. | Inventory, documents, reports, `e01-t02` |
| Document numbering | PRD D-SEQ-01: sequence identity is `(site_id, document_type, year)`. | Treat generated reference numbers as server-owned and scope list/filter displays by returned site context. | ERD/schema warehouse-based or composite string descriptions are not frontend contract sources. | Warehouse/document services, `e01-t02` |
| Transfer | PRD D-TRF-01: one Transfer document produces atomic source/destination movements; asset transfers are deferred. | Provide one source/destination form and no paired outbound/inbound document UI. Suppress asset-transfer functionality. | ERD `TransferOutbound`/`TransferInbound` document variants are stale. | Transfer, inventory, asset modules |
| Opening balances | PRD D-OPEN-01: Opening is a `WarehouseDocument` with standard lifecycle and line `opening_type` (`Initial`/`Correction`). | Use the generic document surface with an Opening specialization only after the API exposes `opening_type`. | `opening_type` is absent from the PRD’s DocumentLine table and ERD/schema; this is an API gap, not a UI default. | `e01-t02`, opening/document tasks |
| Adjustment exception | PRD D-ADJ-01 and SAD §6: adjustment is manager-owned `Draft → Posted → Reversed`, not generic keeper-submit flow. | Use a distinct policy/action model; do not compose the generic lifecycle bar for adjustments until its contract is approved. | ERD/schema `Submitted`/`Approved` adjustment states are stale. Disposal conflicts with this rule; see U-01. | `e01.3`, document policy gates, count/adjustment modules |
| Count freeze policy | PRD §10/§12.6 enumerates HardFreeze, SoftFreeze, and NoFreeze; Architecture Overview and ERD state SoftFreeze-only v1. | Do not expose, hide, or enforce any policy option until the v1 contract is approved. | The conflict changes available controls and posting behavior. | `e01.2`, inventory-count module |
| Asset and custody state | PRD D-AST-02/D-CUS-01: asset state is derived, and custody is a single active/closed record model; no mutable Asset status/current-custody pointer. | Render state as server-derived/read-only. Use the shared custody timeline and never calculate status from partial client data. | ERD/schema legacy custody statuses and type sets are not authoritative. | Asset, custody, reports, `e01-t02` |
| Polymorphic counterpart types | PRD permits Employee, OrganizationalUnit, Site, and External and mandates application-layer validation. The approved counterpart decision defines ExternalParty, active-only writes, historical resolution, and custody-kind mapping. | Use only contract-provided, active lookup values; do not synthesize an External entity, a free-text fallback, or a type mapping. | ERD/schema labels and allowed holder types disagree. | `e01.5`, `e01-t02`, organization/custody/issue lookup tasks |
| Authentication session and active scope | D-AUTH-01: access JWT is memory-only; rotating refresh credential is a Secure/HttpOnly/SameSite cookie; the session response is authoritative for available/active scopes, roles, and permissions. Enterprise `scopeId` is null. | Hydrate through the shared auth adapter, never persist tokens, distinguish `401` from `403`, and clear protected query data on logout or scope change. | Supersedes the provisional JSON refresh-token body and non-null Enterprise scope identifier. Exact security lifetimes remain backend configuration. | `e01-t03`, `e08-t03`, `e06-t01`–`e06-t07`, `e07-t05`, `e24-t06`, `e26-t02` |
| API types and generated client | SAD §3.1 requires Apidog OpenAPI → generated TypeScript/service surface; D-OAS-02 admits a versioned provisional snapshot while the backend is unfinished. | Generate from the admitted snapshot; no frontend API type, endpoint, or response shape may be handwritten as a competing contract. | Development/mocking may proceed, while production integration remains subject to backend ratification and versioned compatibility review. | `e01.6`, `e08-t01`, `e08-t02` |

## Unresolved external decisions

| ID | Gap and evidence | Required decision | Blocking Bead | Downstream impact |
| --- | --- | --- | --- | --- |
| U-01 | PRD §12.7 defines a manager-owned adjustment exception, while §12.10 has a keeper create/submit an Adjustment for disposal. The documented schemas omit a disposal asset reference and posting event. | One adjustment/disposal lifecycle, RBAC model, payload, asset reference, signed-copy rule, and audit/history effect. | `eiams-frontend-e01.3` | Adjustment, count, asset, custody, document-policy UI |
| U-02 | PRD §12.9 creates a consumable `Receipt` on return, but its stock enum has no Return value. PRD D-AST-02 derives Disposed from an asset event that the documented asset enum omits. ERD/schema use other legacy names. | Canonical stock and asset event vocabulary and document-to-event mapping. | `eiams-frontend-e01.4` | Inventory ledger, returns, disposal, asset status, reporting |
| U-03 | PRD requires a signed copy to be attached **and verified**, while the documented attachment fields only define type and file metadata. | Attachment verification state, authority, API, failure response, and Post-gate semantics. | `eiams-frontend-e01-t05` | Upload, document action bar, error states |
| U-04 | PRD exposes three freeze policies; Architecture Overview/ERD defer two of them. | Supported v1 enum set and warning/blocking semantics. | `eiams-frontend-e01.2` | Inventory-count UI, document posting gates |
| U-06 | The project calls for BDM alignment, but no BDM artifact is present. | Canonical BDM, owner, version, provenance, or explicit waiver. | `eiams-frontend-e01.1` | All domain and OpenAPI decisions |
| U-07 | No Apidog/OpenAPI artifact is present. `opening_type`, upload lifecycle, pagination, error envelopes, and all endpoint shapes therefore remain unpinned. | Publish the versioned OpenAPI source snapshot and provenance defined by D-OAS-01; pin generated-client inputs. | `eiams-frontend-e01.6` | Every API-consuming frontend task |
| U-08 | SAD references adjustment, lifecycle-history, audit-detail, and signed-original decision artifacts that are absent. | Publish approved artifacts or record their decisions in their owning Beads. | `e01.3`, `e01-t04`, `e01-t05`, `e01-t06` | Lifecycle, attachment, audit, adjustment infrastructure |

**Resolution note:** U-02 is resolved by D-RAE-01 below. Its row remains as
historical evidence of the source conflict; it is no longer a blocker.

**Resolution note:** U-01 is resolved by D-ADJ-01 below. Its row remains as
historical evidence of the source conflict; it is no longer a blocker.

**Resolution note:** U-04 is resolved by D-ICF-01 below. Its row remains as
historical evidence of the source conflict; it is no longer a blocker.

**Resolution note:** The lifecycle-history portion of U-08 is resolved by
D-LIFE-01 below and its adjustment portion by D-ADJ-01. Its signed-original and
audit-detail artifacts are now published by D-ATT-01 and D-AUD-02 below.

**Resolution note:** U-03 is resolved by D-ATT-01 below. Its row remains as
historical evidence of the source conflict; it is no longer a blocker.

**Resolution note:** U-06 is resolved by D-BDM-01 below. Its row remains as
historical evidence of the missing-source finding; it is no longer a blocker.

**Resolution note:** U-07 is resolved for frontend development and mocking by
D-OAS-02 below. Its row remains as historical evidence of the missing-source
finding. Backend ratification remains a production-integration gate.

## Rejected implementation alternatives

- **Resolve behavior per feature:** rejected because it would duplicate policy and create inconsistent RBAC, lifecycle, and ledger behavior.
- **Treat ERD/schema directly as the API contract:** rejected because they conflict with governing PRD Chapters 9–10 and bypass the admitted, provenance-backed OpenAPI snapshot.
- **Use historical Mantine/Radix/Lucide examples as a stack change:** rejected by the SAD’s explicit Base UI/Tabler decision.
- **Make permissive client-side fallbacks for missing enums or counterparties:** rejected because ledgers, custody, and document posting are audit-critical and contract-owned.

## Decisions published after baseline

| ID | Decision artifact | Outcome | Affected Beads |
| --- | --- | --- | --- |
| D-POST-01 | `docs/polymorphic-counterpart-lookup-contract-decision.md` | All IssueTo and Custody counterpart types use UUID identities. External is the active/inactive ExternalParty reference entity; Employee is Personal-only and all other types are Operational-only. Search and validation are server-authoritative, while inactive references remain historically resolvable. | `e01-t02`, `e04-t08`, `e04-t12`, `e09-t09`, `e16-t03`, `e16-t06`, `e19-t03`, `e19-t05`, `e09.1` |
| D-RAE-01 | `docs/return-asset-movement-event-contract-decision.md` | Return reuses positive stock `Receipt`; asset events are `Received`, `Issued`, `Returned`, and `Disposed`; disposal never double-deducts stock. Derived asset status remains server-owned. | `e01-t02`, `e01.3`, `e14-t05`, `e18-t05`, `e19-t01`, `e19-t06`, `e19-t07`, `e21-t08`, `e23-t06`, `e23-t07` |
| D-ADJ-01 | `docs/adjustment-workflow-decision.md` | Adjustment and disposal use the manager-owned `Draft -> Posted -> Reversed` exception; disposal is a single asset-backed, terminal, non-reversible adjustment with a signed-original post gate and server-owned ledger/custody effects. | `e01-t02`, `e01-t05`, `e12-t12`, `e20-t08`, `e20-t11`, `e21-t01`–`e21-t09`, `e18-t05`, `e19-t01`, `e19-t09`, `e23-t08`, `e23-t09`, `e24-t05` |
| D-ICF-01 | `docs/inventory-count-freeze-policy-decision.md` | V1 supports `SoftFreeze` only. An in-progress count produces server-computed, non-blocking overlap warnings through one shared policy advisory; `HardFreeze` and `NoFreeze` are deferred to v2. | `e01-t02`, `e12-t12`, `e20-t01`, `e20-t03`, `e20-t05`, `e20-t09`, `e20-t10`, `e20-t11`, `e21-t01`, `e21-t09`, `e23-t08`, `e24-t05` |
| D-BDM-01 | `docs/business-domain-model-v1.md` | Publishes the versioned, provenance-backed EIAMS v1 BDM: bounded entities, authoritative relationships/invariants, decision-backed enum meanings, unresolved contract gaps, and PRD/OpenAPI alignment work. | `e01-t02`, `e01-t04`–`e01-t07`, `e09.1`, all feature/service tasks |
| D-OAS-01 | `docs/openapi-contract-surface-inventory.md` | Defines the EIAMS v1 OpenAPI publication/admission gate, required domain and cross-cutting surface inventory, and semantic compatibility rules. D-OAS-02 supersedes only its original assumption that the first admitted snapshot must be backend-owned. | `e01.6`, `e08-t01`, `e08-t02`, `e01-t03`–`e01-t07`, all API-consuming tasks |
| D-OAS-02 | `contracts/openapi/eiams-v1.openapi.json` and `contracts/openapi/eiams-v1.provenance.json` | Admits an architecture-owned OpenAPI 3.0.3 provisional contract for Apidog mocks and deterministic frontend generation. It records that no backend/Apidog export exists and requires backend ratification plus versioned incompatibility handling before production integration. | `e01.6`, `e01.7`, `e08-t01`, `e08-t02`, all API-consuming tasks, release readiness |
| D-AUTH-01 | `docs/authentication-session-scope-contract-decision.md` | Defines memory-only bearer access tokens, rotating HttpOnly refresh cookies, authoritative session hydration, hierarchical effective-scope calculation, explicit scope selection, `401`/`403` behavior, and cross-scope cache isolation. | `e01-t03`, `e01-t07`, `e08-t03`, `e06-t01`–`e06-t09`, `e07-t05`, `e22-t06`, `e24-t06`, `e26-t02` |
| D-LIFE-01 | `docs/document-lifecycle-history-contract-decision.md` | Defines generic and adjustment/disposal transitions, explicit Revise, immutable actual-event history, server-owned action presentation, typed reason/version requests, and atomic compensating reversal results. | `e01-t04`, `e01-t07`, `e04-t14`, `e04-t15`, `e12-t09`, document features, lifecycle integration tests |
| D-ATT-01 | `docs/signed-original-gate-decision.md` | Defines the signed-original gate as a server-authoritative policy signal (`signedOriginalSatisfied` + blockers), upload validation and replaceable satisfier semantics, Draft-only mutation window, and the missing-signed correction path via Reject → Revise. | `e01-t05`, `e01-t07`, `e04-t09`, `e04-t13`, `e04-t15`, `e12-t12`, document/adjustment features, `e01.7`, `e24` |
| D-AUD-02 | `docs/audit-detail-contract-decision.md` | Defines the two-surface audit read model (paginated header list + field-diff detail), server-enforced redaction reaching the browser only as `redacted` flags, Arabic-safe summaries, and the typed action vocabulary. | `e01-t06`, `e22-t07`, `e01-t07`, `e24-t07`–`e24-t09`, `e01.7` |
| D-RBAC-01 | `docs/route-permission-scope-matrix.md` | Defines the canonical v1 `resource.verb` permission vocabulary, the route-to-permission guard matrix, scope derivation via the active scope, and the reference seed roles (SYSTEM_ADMIN, DATA_MANAGER, WH_MGR, WH_KEEPER, AUDITOR). | `e01-t07`, `e05-t02`, `e06-t05`, `e06-t06`, `e07-t01`, `e07-t03`, `e12-t12`, `e22-t06`, `e24` |
| D-MAT-01 | `docs/material-classification-and-custody-decision.md` | Defines the material-kind/tracking/accountability matrix, separates asset number from serial number, and records the required Durable-custody subject/partial-return contract. | `eiams-frontend-bt60`, `e10-t09`, `e01-t02`, `e19-t01`â€“`e19-t09` |
| D-UOM-01 | `docs/material-unit-conversion-contract-decision.md` | Defines a Material-owned base unit, direct per-material alternate-unit factors, immutable line snapshots, and archive/replace change control for used conversions. The API surface is provisional until backend/API-owner ratification. | `eiams-frontend-vded`, `e10-t11`, `e01-t02` |
| D-INV-READ-01 | `docs/inventory-read-contract-decision.md` | Defines typed deterministic server sorting, `balanceId` detail identity with scope-concealing 404 behavior, and a server-computed low-stock projection/filter using `quantity <= minQuantity`. | `e14.1`, `e14.2`, `eiams-frontend-otay`, `e14-t01`–`e14-t07`, `e01.7` |

## Implementation guardrails for downstream work

- Every service/type task depends on the OpenAPI inventory decision and consumes the generated surface.
- Every document action must use permission/scope predicates plus server-authoritative state.
- Every timeline, balance, derived asset status, and audit display must render contract data rather than reconstructing domain history in the browser.
- Unsupported v1 behavior is hidden rather than emulated, unless an approved contract explicitly specifies a read-only representation.

## Dependency outcome

`eiams-frontend-e01-t01` now releases five narrowly scoped P0 decisions
(`e01.1`–`e01.5`). `eiams-frontend-e01-t02` depends on all of them, so OpenAPI
inventory begins only after its business-semantic inputs are explicit. Existing
tasks `e01-t03` through `e01-t08` remain downstream of `e01-t02` through the
existing graph.
