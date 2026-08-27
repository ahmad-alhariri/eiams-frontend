# EIAMS V1 KPI and Report Contract Matrix Decision

**Status:** Accepted as the EIAMS v1 frontend implementation boundary; dashboard semantics and export/print remain externally blocked
**Decision ID:** D-RPT-01
**Beads:** `eiams-frontend-e23-t01`
**Decision date:** 2026-08-27
**Contract baseline:** `contracts/openapi/eiams-v1.openapi.json`, provenance `1.0.0-provisional.9`

## Decision

EIAMS v1 reports are read-only, server-scoped projections. The frontend may
render only the generated response models and the query parameters explicitly
declared by the provisional OpenAPI contract. It must not calculate a KPI,
aggregate a ledger, reconstruct a report from downloaded pages, or add a
report endpoint, filter, export, or print behavior absent from that contract.

The approved v1 matrix below separates what downstream work can implement from
what remains blocked on product and backend/API ownership. It deliberately does
not assign meanings to `KpiValue.code`, `KpiValue.value`,
`DashboardSeriesPoint.label`, or `DashboardSeriesPoint.value`: their schemas
describe transport shape, not a ratified business formula.

## Governing evidence and precedence

| Source | Binding consequence for this decision |
| --- | --- |
| Bead `eiams-frontend-e23-t01` | Requires a source-cited KPI/report matrix, explicit alternatives and compatibility impact, and Beads blockers for unresolved external gaps. |
| `docs/business-domain-model-v1.md` — “Purpose, authority, and change control”; “Domain map”; “Document-driven inventory”; “Authentication, session, and scope”; “Contract gaps and deliberately excluded assumptions” | Source order is Bead/approved decision, PRD chapters 9–10, BDM, SAD, then ERD/schema. Balances, asset status, scopes, and ledgers are server-owned read models; omissions are not implied behavior. |
| `docs/PRD.md` — Chapter 9 `D-INV-01`, `D-MOV-01`, `D-AST-02`, `D-AUD-01`; Chapter 10 inventory, movement, document, count/adjustment, asset/custody, and audit tables; Chapter 11 | Balances are quantity-only cached movement sums; movement and audit records are append-only; asset status is derived; advanced reporting is deferred. Database tables are evidence, not a browser reporting API. |
| `docs/SAD.md` — §§9–12, especially §9.1 and §10 reports boundary | One shared generated API layer, feature ownership for reports/dashboard/export, Arabic-safe failure handling, server-state ownership, and quality constraints apply. The SAD does not define KPI formulas. |
| `docs/ERD.md` — §§2.5, 2.7–2.10 and append-only summary; `docs/schema.md` — §§5, 7–10 | Balance, movement, asset/custody, count/adjustment, document, and audit storage establish provenance and immutability only. Neither source creates a report table, formula, endpoint, or export format. |
| `docs/inventory-read-contract-decision.md` (`D-INV-READ-01`) | Inventory list/detail and low-stock are server-owned, scope-filtered projections; the client does not compute low stock, sort a fetched page, or join pages. |
| `docs/inventory-count-freeze-policy-decision.md` (`D-ICF-01`), `docs/adjustment-workflow-decision.md` (`D-ADJ-01`), `docs/return-asset-movement-event-contract-decision.md` (`D-RAE-01`), `docs/document-lifecycle-history-contract-decision.md` (`D-LIFE-01`) | Count state/advisories, adjustment purpose/lifecycle, canonical events, and document history retain their server-defined meanings in any report. No derived or renamed workflow event is permitted. |
| `docs/audit-detail-contract-decision.md` (`D-AUD-02`) | Recent activity uses redacted, paginated server audit projections only; the browser never reconstructs history or exposes raw values. |
| `docs/authentication-session-scope-contract-decision.md` (`D-AUTH-01`) and `docs/route-permission-scope-matrix.md` (`D-RBAC-01`) | The server-selected active scope and effective permissions are authoritative; report access is `report.view` at any scope, while server responses remain scope-filtered. |
| `docs/openapi-contract-surface-inventory.md` (`D-OAS-01`) and `contracts/openapi/README.md` | Generated OpenAPI types/client, server pagination, Arabic-safe problem details, and versioned compatibility are mandatory; report/KPI/print/export contracts need an owning decision before implementation. |
| `docs/ui-design.md` §§5.8, 9, 12.4, 13; `docs/design-tokens.md` §§3–4, 8, 10; `docs/component-guidelines.md` §§2, 5–8, 11–13 | KPI card/dashboard pattern and Arabic RTL, existing shared primitives, server `DataTable`, visible focus, semantic table headers, loading/empty/error states, and tests are mandatory downstream behavior. Visual examples do not define KPI formulas or a print contract. |
| `AGENTS.md` | Uses TanStack Query for server state, generated types, `usePermission`, metadata-driven routes, server pagination, no direct `fetch`, Arabic UI, and logical RTL CSS. |

## V1 contract matrix

“Allowed now” means the operation and transport fields exist in the admitted
provisional snapshot; it does not mean the backend has been ratified. All
operation names and parameter spellings below are read directly from that
snapshot. `pageIndex` is zero-based; `pageSize` is 1–200 (default 25 under
`contracts/openapi/README.md`).

| Consumer / downstream Bead | Contracted read and response | Allowed query parameters | Explicit v1 behavior | Status |
| --- | --- | --- | --- | --- |
| Dashboard response surface; `e23-t02`, `e23-t03` | `GET /reports/dashboard` (`getDashboardReport`) → `DashboardReport { generatedAt, kpis, movementTrend, assetStatusDistribution }`; `KpiValue { code, labelAr, value, unitAr?, changePercent? }`; `DashboardSeriesPoint { label, value }` | `siteId`, `warehouseId`, `dateFrom`, `dateTo` | Render returned Arabic labels and values only. No card vocabulary, formula, percentage baseline, date-boundary, time-zone, chart bucket, or empty-series meaning is inferred. | **Blocked** by `eiams-frontend-4kd7`. |
| Recent activity and low-stock attention; `e23-t04` | Existing audit header list/detail from `D-AUD-02`, and existing inventory balance projection from `D-INV-READ-01`; no dashboard-alert schema exists | Only the parameters declared on the consumed audit/inventory operations | A page may present separate, clearly labelled server projections only when the user also has the constituent `audit.view` or `inventory.view` permission. It must not combine them into a new alert score, derive lifecycle history, or claim a new report aggregate. Low stock is only returned `lowStock.state = Low`; audit content stays redacted. | Allowed as separately permission-gated composition; any new aggregate/alert feed needs a new contract Bead. |
| Inventory balance report; `e23-t05` | `GET /reports/inventory` (`getInventoryReport`) → `InventoryBalancePage` | `pageIndex`, `pageSize`, `warehouseId`, `search` | The server owns balances and page total. It may render returned low-stock/read provenance fields, but no undocumented filter/sort or client reconciliation is added. | Allowed now. |
| Stock movement report; `e23-t06` | No `/reports/movements` operation. Use the existing generated inventory movement ledger read already governed by `D-INV-READ-01`, not an invented report endpoint. | Exactly the existing movement operation’s declared filter/sort/page parameters | Render immutable, signed, server-returned movement rows and provenance. Do not group, total, rename events, or locally reverse a ledger. | Allowed only as the existing ledger projection; a distinct aggregate/movement-report API requires a new decision. |
| Asset and custody reports; `e23-t07` | `GET /reports/assets` (`getAssetReport`) → `AssetPage`; custody remains its existing generated read surface | Assets: `pageIndex`, `pageSize`, `warehouseId`, `status`; custody: only its existing operation parameters | Asset derived status and custody/history are server projections. Asset and custody must remain distinct reads unless a future response explicitly joins them. | Allowed as separate projections; no client status/custody join or summary. |
| Count and adjustment report; `e23-t08` | `GET /reports/count-adjustments` (`getCountAdjustmentReport`) → `InventoryAdjustmentPage`; inventory counts remain their existing generated read surface | Report: `pageIndex`, `pageSize`, `warehouseId`, `dateFrom`, `dateTo`; counts: existing operation parameters only | Adjustment purpose/state and count lifecycle retain their approved server meanings. The frontend does not calculate variance, infer a count-to-adjustment match, or create a combined aggregate. | Allowed as separate projections; a combined count-adjustment aggregate requires a new decision. |
| Operational documents report; `e23-t09` | `GET /reports/documents` (`getDocumentReport`) → `WarehouseDocumentPage` | `pageIndex`, `pageSize`, `warehouseId`, `dateFrom`, `dateTo` | Render server document spine projection, status, references, and provenance. Type/status filters, lifecycle derivation, or unsigned-post inference are not added unless the contract adds them. | Allowed now. |
| Export and print; `e23-t10` | **No OpenAPI operation, response schema, content type, or print contract exists.** | None | Do not generate CSV/XLSX/PDF, request an assumed URL, print an unbounded paginated dataset, or call browser print as a legal report export. | **Blocked** by `eiams-frontend-opv2`. |

## Server and frontend ownership

| Concern | Server/API owner | Frontend owner |
| --- | --- | --- |
| Scope and authorization | Resolve active scope, apply data restrictions, and authorize every request. | Gate route/navigation/control visibility with `report.view`; never filter data locally to emulate scope. |
| Domain truth | Compute balances, low-stock state, counts/adjustments, asset status, custody, document lifecycle, audit redaction, KPIs, series, and any aggregation. | Render returned fields; preserve server identifiers/references and never calculate missing business state. |
| Query semantics | Define every filter, sort, page, date range, time-zone boundary, ordering tie-break, total, and empty result in OpenAPI. | Send only documented parameters; reset `pageIndex` to zero on an allowed filter change; place every selected parameter and active scope in the query key. |
| Pagination | Page and count the scoped result, with stable ordering where declared. | Use `DataTableServer`/`ServerPaginationControls`; never concatenate pages for export, aggregate a partial page, or apply local sort/filter. |
| Language and presentation | Return contract-provided Arabic labels/messages where schema promises them. | All fixed UI labels, errors, loading/empty states, accessible names, and unknown-code treatment are Arabic. Render unknown contract codes as codes rather than invented Arabic business labels. |
| Errors and concurrency | Return documented `ProblemDetails`, correct 401/403/404/422/409 meanings, and correlation data where available. | Use shared Arabic-safe error state/retry; 401 follows session handling, 403 stays an access denial, and 404 is neutral. Never reveal raw payload/internal detail or convert an error into a business rule. |

## Cross-cutting downstream rules

1. **Access and routes.** The only reports route is `ROUTE_PATHS.reports`
   (`/reports`) with `ROUTE_METADATA.reports.permissions = ['report.view']`.
   It is currently wired to the shared `routePlaceholderPage` in
   `src/config/route-registry.tsx`. A downstream e23 implementation replaces
   only that `reports` registry entry with the lazy reports page; no parallel
   route guard or permission code may be introduced. The dashboard route retains its existing `permissionAny`
   metadata; report data never widens that access predicate. A dashboard card
   backed by another module's endpoint additionally checks that endpoint's
   documented view code (`audit.view`, `inventory.view`, `asset.view`,
   `count.view`, or `document.view`) and is absent when that code is missing;
   `report.view` never grants cross-module reads.
2. **Scope and caching.** Every authenticated report query uses the active
   scope cache key through the shared query-key infrastructure and the complete
   normalized documented filter object. Use `OPERATIONAL_STALE_TIME` (30
   seconds) rather than treating a report as master data. Active-scope changes
   remove protected scoped queries; a successful posting/reversal/count/asset/
   custody mutation invalidates affected report keys and relies on the next
   server result. Do not optimistic-update totals, cards, or charts.
3. **Filters and pagination.** Omitted optional filters mean exactly what the
   operation specifies; a browser does not substitute “all warehouses”, a
   calendar default, or inclusive/exclusive boundaries. The UI exposes only
   matrix-listed parameters. All table filtering/sorting/searching remains
   server-side and filtered totals come from the server `PageMeta`.
4. **Export and print.** Until `eiams-frontend-opv2` is resolved, no output
   button is rendered. A printed screen, client-built file, or merged pages
   cannot be represented as an official report. `e23-t10` owns implementation
   only after the approved contract identifies the permitted behavior.
5. **Arabic, RTL, and accessibility.** Use `PageHeader`, `ContentCard`,
   `DataTableServer`, `StatusBadge`, `EmptyState`, `ErrorState`, and shared
   formatting utilities before creating report-specific infrastructure. Use
   Arabic labels/copy, `dir="rtl"`, logical `ps`/`pe`/`ms`/`me` utilities,
   semantic table headers, visible focus, keyboard-operable controls, text plus
   color for status, and announced loading/error changes. Charts need a
   keyboard/screen-reader equivalent data table or textual summary; the chart
   itself is not the only carrier of information.
6. **Testing.** MSW fixtures come from the admitted OpenAPI schemas and this
   matrix. Tests cover permitted filters, page reset, loading/empty/error/403
   behavior, Arabic RTL labels, focus/semantic table behavior, scope-key
   separation, and no client aggregation. Browser QA remains separate evidence
   and cannot establish backend scope/RBAC enforcement.

## Compatibility and OpenAPI impact

The existing five report operations are consumed unchanged. Adding a
previously absent response field, optional filter, or separate operation is
additive only when it preserves existing schema meaning and generated client
compatibility. Renaming an operation, changing a page envelope, redefining an
existing KPI code/series bucket, changing date-boundary interpretation, or
changing an export format is a reviewed breaking semantic change even if a
TypeScript shape still compiles.

Any approved change must update the OpenAPI semantic version and
`contracts/openapi/eiams-v1.provenance.json`, regenerate the checked-in types,
validate Redocly/reference/type generation, update MSW fixtures/tests, and be
reviewed against `eiams-frontend-e01.7` backend/API ratification. Generated
files and feature-local DTO/endpoint adapters are never hand-patched to bridge
an unratified difference.

`eiams-frontend-4kd7` must supply the dashboard semantic vocabulary before
`e23-t02` and `e23-t03` begin. `eiams-frontend-opv2` must supply export/print
semantics before `e23-t10` begins. A new downstream request for a combined
asset/custody, count/adjustment, movement aggregate, or activity/alert feed
requires its own Bead and versioned contract addition; it is not folded into a
page implementation.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `eiams-frontend-e23-t02` | Render KPI cards only after `4kd7` ratifies meanings; never infer `code`, change percentage, or missing values. |
| `eiams-frontend-e23-t03` | Render only returned dashboard series after `4kd7`; provide accessible tabular/textual equivalent. |
| `eiams-frontend-e23-t04` | Reuse redacted audit and low-stock projections without manufacturing an alert aggregate. |
| `eiams-frontend-e23-t05` | Consume the inventory report page with documented query parameters and server data table semantics. |
| `eiams-frontend-e23-t06` | Present the existing stock-movement ledger rather than inventing `/reports/movements` or local aggregates. |
| `eiams-frontend-e23-t07` | Keep asset and custody projections separate and server-derived. |
| `eiams-frontend-e23-t08` | Keep counts and adjustments as separately contracted projections; do not calculate variance/report totals. |
| `eiams-frontend-e23-t09` | Consume only document-report filters/projection and server lifecycle truth. |
| `eiams-frontend-e23-t10` | Remains blocked on `opv2`; no placeholder export/print behavior. |
| `eiams-frontend-e23-t11` | Verify the matrix's server-state, RTL/a11y, error, scope, and blocker rules once implementations exist. |
| `eiams-frontend-e01.7` | Ratify all report additions and semantic compatibility against backend/Apidog before production integration. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Calculate cards, trends, totals, or low-stock alerts from cached pages | Partial pages and stale scope data cannot reproduce authoritative ledger, threshold, or KPI semantics. |
| Treat `KpiValue.code` or a chart label as self-describing business logic | A free string/schema shape cannot define formula, period, null handling, or Arabic business meaning. |
| Add convenient local report filters, `all warehouses`, date defaults, or a `/reports/movements` path | These alter server scope/query semantics without a versioned contract. |
| Join asset/custody, count/adjustment, audit, or balance pages in the browser | Cross-page joins create incomplete, stale, and scope-unsafe reporting state. |
| Export visible rows or combine pages into CSV/PDF | It misrepresents a bounded client page as an official report and has no approved format/provenance contract. |
| Use browser print as an interim official report | It lacks ratified scope, full-result, page-break, legal-header, accessibility, and retention behavior. |
| Hide raw errors or map unknown values to friendly invented Arabic labels | It obscures contract drift and can assert an unapproved business meaning. |

## Explicit external gaps and blockers

| Gap | Blocking Bead | Consumers blocked | Required external resolution |
| --- | --- | --- | --- |
| KPI codes/formulas, series buckets, date/time semantics, zero/null/no-data, percentage baseline, and Arabic semantic labels | `eiams-frontend-4kd7` | `e23-t02`, `e23-t03` | Product plus backend/API approval and a versioned OpenAPI/provenance update or incorporated approved decision. |
| Export/print resource model, output scope/completeness, format, printable Arabic RTL layout, async/error/provenance/accessibility behavior | `eiams-frontend-opv2` | `e23-t10` | Product plus backend/API approval and versioned contract/decision evidence. |
| Production equivalence of the provisional report contract | `eiams-frontend-e01.7` | Production integration and release controls | Backend implementation and authoritative Apidog export ratification; it is not a reason to handwrite a frontend adapter. |

The unresolved gaps are intentionally represented as Beads dependencies. They
are not defaults for page authors to fill in later.
