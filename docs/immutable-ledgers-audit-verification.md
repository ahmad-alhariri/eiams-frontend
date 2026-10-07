# Immutable ledgers and audit inspection — verification

Implementation slice: `eiams-frontend-e24-t08`. This slice proves that the five
append-only ledgers are read-only in the frontend, fixes the five defects that
verification exposed in the ledger and audit read surfaces, and records the
audit gaps D-AUD-02 still requires without closing them.

## Governing contracts

- **D-AUD-02** — `docs/audit-detail-contract-decision.md`: audit is a
  server-owned, append-only, read-only domain. Sensitive values are redacted
  server-side **before** they reach the query cache; the client never guesses,
  reconstructs, or requests a non-redacted variant. Order is fixed server-side
  and v1 exposes no client sort columns, because audit chronology is an evidence
  property. §3 requires short stale times and invalidation after any mutation
  that may generate audit records — see *Known gaps not fixed here*.
- **AGENTS.md** — "Immutable Ledgers … never updated or deleted"; server
  pagination for all data tables; Arabic UI, English identifiers.
- **D-RAE-01 / D-LIFE-01** — derived asset status comes from custody plus asset
  movement provenance; lifecycle and audit are separate ledgers that are
  correlated, never mixed.

## The five ledgers, and a naming clarification

| Ledger | Contract type | Read endpoint | Frontend surface |
| --- | --- | --- | --- |
| Stock movements | `StockMovement` | `GET /inventory/movements` | `inventory/pages/stock-movements-page` |
| Audit headers | `AuditLog` | `GET /audit-logs` | `audit/pages/audit-log-explorer-page` |
| Audit field diff | `AuditLogEntry` | `GET /audit-logs/{auditLogId}` | `audit/components/audit-detail` |
| Asset movements | `AssetMovement` | `GET /assets/{assetId}/movements` | `asset/components/asset-movement-ledger` |
| Asset custody | `AssetCustody` | `GET /assets/{assetId}/custody` | `asset/pages/asset-custody-history-page` |

**Naming.** `docs/ERD.md` and `AGENTS.md` name the custody and asset-movement
tables `CustodyHistory` and `AssetMovementHistory`. Those are **database table
names, not frontend types**. The contract exposes `AssetCustody` and
`AssetMovement`, and those are the only names the TypeScript surface, the
services, the query keys, and the fixtures use. A search for `CustodyHistory` in
`src/` returns only prose; nothing in the frontend is typed by the DB name.

## Automated evidence

`src/test/immutable-ledgers-audit.test.tsx` (20 cases).

| Test surface | Behavior exercised |
| --- | --- |
| `inventoryService` / `assetService` / `auditService` method shape | Exactly `get*`/`list*`; no `post`/`put`/`patch`/`delete` on any ledger service source |
| `src/` cache-write scan | No `setQueryData` / `updateQueryData` / `removeQueries` / `onMutate` names a ledger query key or endpoint |
| `clearScopedQueries` (behavioural) | A session scope change drops ledger caches — a session boundary, not a browser-authored row |
| `src/test/**` mock-surface verb scan | Every ledger endpoint is registered `http.get` in the harness; none is registered with a write verb (repointed from the deleted `src/mocks/handlers.ts` by `eiams-frontend-m4jm`, and widened to the whole mock surface) |
| Production services + MSW | All four stock/asset/audit reads return the `createCrossModuleScenario().ledgers` rows unchanged; the audit **list** read returns zero entries per header (D-AUD-02) |
| `auditService.getAuditLog` | A redacted scenario entry stays redacted: no `oldValue`/`newValue` key at all, reason preserved |
| `createAssetMovement` / `createAssetCustody` | The new asset-movement factory yields a contract-complete append-only row; a closed custody carries `toTs` |
| `AuditDetail` — unknown `auditLogId` | 404 → Arabic error state with a retry action, not an empty diff |
| `AuditDetail` — zero entries | The dedicated empty branch renders |
| `AuditDetail` — `redactionReasonAr: null` | Falls back to the fixed Arabic sentence `القيمة محجوبة وفق سياسة التدقيق.` and still shows the `قيمة محجوبة` placeholder |
| `AuditDetail` — list → detail → back | The shared `?auditLogId=` param round-trips and the back control returns to the header list |
| Audit explorer — `?auditLogId=` (blank) | **Zero** requests to `/audit-logs/`, no detail view, no error state |
| Custody timeline | A closed row renders `toTs` through `formatDateTime`; the raw ISO string is absent; an open row shows `—`; the failure state recovers through the shared `Button` (`data-slot="button"`); no mutation affordance exists |
| Asset movement ledger | `totalPages: 3` produces a working control: clicking *التالي* issues `pageIndex=1` and renders the next page's row |
| Asset movement ledger | `occurredAt` renders through `formatDateTime`; the raw ISO value is absent |

Each of the four behavioural defect cases was confirmed to fail against the
pre-fix code (blank-param, inert pagination, missing `toTs`, raw ISO) and pass
after it.

## Defects found and fixed

| # | Defect | Fix and rationale |
| --- | --- | --- |
| F-1 | `asset-movement-ledger.tsx` hardcoded `{ pageIndex: 0, pageSize: 20 }` and passed no-op `onPageChange` / `onPageSizeChange` while rendering the server's `totalPages` — the control looked real and did nothing. | Consumes the shared `useServerPagination` and passes the live `page`/`pageSize`/`setPage`/`setPageSize` to `DataTableServer`, exactly as `stock-movements-page.tsx` does. No new pagination mechanism was introduced. Side effect: the requested page size becomes the shared default (10, one of `PAGE_SIZE_OPTIONS`) instead of the ad-hoc 20, which the page-size selector could not have offered. |
| F-2 | `asset-custody-history-page.tsx` never rendered `AssetCustody.toTs`, so a closed custody row hid the only record of when the asset came back. | A `نهاية العهدة` column renders the end time for closed rows and `—` for an open one, using the file's existing field markup and `dir="ltr"` timestamp span. |
| F-3 | `occurredAt` (movement ledger) and `fromTs` (custody timeline) rendered the raw ISO string. | Both use the shared `formatDateTime` from `@/shared/utils/format` — the same formatter the audit surfaces already use (`audit-log-explorer-page.tsx`, `audit-detail.tsx`). No new formatter was added. |
| F-4 | `audit-log-explorer-page.tsx` read the param with `?? undefined`, so `?auditLogId=` (present, blank) counted as a selection: the detail query enabled and requested `GET /audit-logs/`, rendering a not-found error for a field the user never filled in. | The param is trimmed and read as absent when blank, at the point of read. `useAuditLogQuery`'s contract is untouched: it still disables on `undefined`, and a real id still enables it. |
| F-5 | `asset-custody-history-page.tsx` used a hand-rolled `<button className="rounded-md border border-border px-4 py-2 text-sm">` for retry, where the shared `Button` is used everywhere else. | Replaced with `@/shared/ui/button` at `variant="outline" size="sm"`, matching the other ledger error states. Note the small appearance normalization: the shared outline variant uses `border-primary` and an `h-8` control rather than the ad-hoc `border-border`/`py-2` box. Consistency with the shared retry affordance was judged worth that. |
| F-6 | **Found by browser QA, after F-2/F-3 were already "done."** `asset-detail-page.tsx` is a *second* surface for the same append-only custody data (its `CustodySection`), and it had both defects independently: it rendered `fromTs` as a raw ISO string, and never rendered `toTs` at all. | `fromTs` now uses the shared `formatDateTime`, and a closed row renders `نهاية العهدة: <formatted>` inline, matching the list item's existing `الحائز: …` shape. Two colocated tests in `asset-detail-page.test.tsx` cover the closed and open cases and assert no raw ISO reaches the DOM. |

F-6 is the reason this slice was not closed on the automated suite alone. F-2
and F-3 were fixed on `/assets/:assetId/custody` and verified there, while the
asset detail page reads the same ledger through the same hook and was missed by
construction. A test suite proves the paths it exercises; it does not enumerate
the surfaces that share a data source. Only a rendered pass found the second
occurrence, which is why the QA step is not optional here.

## Known gaps not fixed here

### Audit cache invalidation after mutations (D-AUD-02 §3)

D-AUD-02 §3 requires audit queries to be invalidated after **any** authenticated
mutation that may generate audit records. That touches every mutation path in the
app and is out of scope for a verification slice, so it is recorded, not built.

Evidence that the requirement is not yet met — no mutation invalidates
`auditQueryKeys`:

- `src/shared/documents/use-document-lifecycle-actions.ts:142` invalidates only
  the document detail branch (`useInvalidateDocumentDetail`,
  `src/shared/documents/use-document-queries.ts:43`).
- `src/shared/documents/use-document-draft-mutations.ts:31` and `:74` invalidate
  document lists and the document detail only.
- `src/modules/custody/hooks/use-custody-queries.ts:42-47` invalidates the
  `custody` resource and `['asset']` — never `audit`.
- `src/modules/receiving`, `issue`, `transfer`, `inventory-count` mutations
  likewise name no audit key; `auditQueryKeys` (`src/modules/audit/hooks/use-audit-queries.ts:12`)
  has no writer outside its own module.

Partial coverage already exists and is inconsistent: adjustment posting
invalidates the whole scoped namespace
(`src/modules/adjustment/hooks/use-adjustment-actions.ts:74`, plus
`useInvalidateAdjustmentScope` at `:45`), so audit entries do refresh after an
adjustment — while document, custody, and count mutations do not. The fix should
be a single shared post-mutation invalidation helper rather than per-module
patches.

### A second invalidation defect found while reading the same file

`src/modules/custody/hooks/use-custody-queries.ts:47` calls
`invalidateQueries({ queryKey: ['asset'] })`. Asset keys are built by
`queryKeys.scoped(...)` (`src/shared/services/query-keys.ts`), so every asset key
begins with `['scoped', kind, id, …]` — `['asset']` matches nothing, and the
invalidation is a silent no-op. The same file's own scoped custody invalidation
(`:42-44`) is correct. Recorded, not fixed: it is a cache-freshness bug in the
custody write path, not a ledger-read-only property.

### Entity → audit correlation links (D-AUD-02 §2)

D-AUD-02 §2 states that links go from entity detail to audit records via
`entityId` + `entityType`. `toAuditEntityFilter`
(`src/modules/audit/types/audit-display.ts:80`) builds exactly that filter and is
referenced only by its own unit test
(`src/modules/audit/types/audit-display.test.ts:41`); no page renders it. The
explorer's `entityType` / `entityId` filter inputs are manual text fields, so a
user must copy ids by hand. Building the link is a navigation/design change
across entity pages, not a verification fix, so it is recorded here.

### Not implemented on purpose: client sort on the audit explorer

D-AUD-02 §7 forbids client sort columns on audit; chronology is an evidence
property the server owns. No sort affordance was added, and
`audit-log-explorer-page.test.tsx` continues to assert that no sortable header is
rendered. This is a deliberate non-action, not a gap.

## What this verification does not prove

MSW is a transport mock. It can show that the browser sends only `GET`s to
ledger endpoints and renders the rows it receives. It proves **nothing** about
the backend:

- **Transaction / atomicity** — that a post writes its document, stock
  movements, asset movements, and custody closure in one transaction is a server
  guarantee. No browser test can observe a rollback.
- **Append-only enforcement** — that a `PUT`/`DELETE` against a ledger row is
  rejected server-side is enforced by the backend, not by the absence of a client
  method. A hand-crafted request bypasses this suite entirely.
- **RBAC and scope filtering on ledger rows** — that a user without
  `audit.view`, or outside the row's scope, receives `403`/`404` is decided by
  the server. The frontend-side claim proved here is only that the module is
  gated and that the client never requests a row it was not scoped to.
- **Redaction completeness** — that a value *should* have been redacted is a
  server policy (D-AUD-02). The frontend proves only that a value the server
  redacted never reaches the DOM, the cache, or a log line.

## Browser QA

Verified in Chrome DevTools MCP against the dev server with MSW mocks. Roles
were exercised by temporarily narrowing `permissionCodes` in
`src/shared/services/dev-session.ts`, which was restored afterwards
(`git diff` on that file empty).

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| C1 | Movement timestamps are formatted, not raw ISO | **PASS** | `١٥ يونيو ٢٠٢٤ ١٢:٠٠ م`, `١ أغسطس ٢٠٢٦ ١:٠٠ م`; no ISO match in the table |
| C2 | Movement pagination is a real control | **PARTIAL** | Page-size selector interactive: choosing `عرض ٢٥ صفاً` re-requested `?pageIndex=0&pageSize=25` → 200. The mock yields one page (2 rows), so multi-page traversal is **not verified in the browser** |
| C3 | Custody `toTs` column | **PARTIAL** | Header `نهاية العهدة` present; active row shows `—`. No **closed** custody row exists in the mock, so the closed-row rendering is **not verified in the browser** (covered by the suite instead) |
| C4 | Shared `Button` with a visible focus ring | **PASS** | `<button>` with shared classes; on Tab, `box-shadow: … 0 0 0 2px, … 0 0 0 4px` |
| C5 | Audit explorer → detail → back | **PASS** | Six headers, 10 rows; row link opens `?auditLogId=…0154` with `الحقل` / `القيمة السابقة` / `القيمة الجديدة`; back returns to the list |
| C6 | Blank `?auditLogId=` issues no request | **PASS** | Exactly one call, `GET /api/v1/audit-logs?pageIndex=0&pageSize=10`; no empty-id request, no error alert |
| C7 | `/audit` still RBAC-gated | **PASS** | With `audit.view` withheld: `ليست لديك صلاحية الوصول`, 0 rows, sidebar entry removed |
| C8 | RTL and no page-level overflow | **PASS** | `dir="rtl"`; at 1283×667 `scrollWidth 1268 ≤ 1283`, at 501×667 `486 ≤ 501`; table overflow confined to its `overflow-x-auto` container |
| C9 | Console cleanliness | **PASS** | 0 errors, 0 warnings across the whole session, including a deliberate error path |

C2 and C3 are PARTIAL because of missing dev-mock data, not because of a code
defect. Both paths are covered by the suite; what could not be done is *seeing*
them rendered. That gap is filed as a bead rather than left implicit, so the next
verification pass can exercise them.

### Findings from QA

- **F-6, fixed here.** The asset detail page's `CustodySection` is a second
  surface for the same append-only custody ledger and had both the raw-ISO and
  the missing-`toTs` defects independently. This was invisible to the suite and
  to the fixes above; only a rendered pass surfaced it.
- **Truncated `aria-label` on audit rows** — the detail link's accessible name
  truncates the id (`عرض تفاصيل سجل التدقيق 00000000…`), so rows share an
  accessible name. Filed.
- **Dev-mock data gaps** — no closed custody row and only two asset movements
  exist, so the closed-row and multi-page paths cannot be rendered. Filed.

## Change log

- `src/test/msw/factories.ts` — **new** `createAssetMovement` factory, beside
  `createAssetCustody` / `createStockMovement`.
- `src/modules/asset/components/asset-movement-ledger.tsx` — F-1 real server
  pagination, F-3 `formatDateTime` on `occurredAt`.
- `src/modules/asset/pages/asset-custody-history-page.tsx` — F-2 `toTs` column,
  F-3 `formatDateTime` on `fromTs`, F-5 shared `Button`.
- `src/modules/audit/pages/audit-log-explorer-page.tsx` — F-4 blank
  `?auditLogId=` normalised to absent.
- `src/modules/asset/pages/asset-detail-page.tsx` — F-6, found by browser QA:
  `formatDateTime` on `fromTs` and an inline `نهاية العهدة` for closed custody
  rows, on the second surface reading the same custody ledger.
- `src/modules/asset/pages/asset-detail-page.test.tsx` — two colocated cases for
  F-6 (closed row shows a formatted end time and no raw ISO; open row omits the
  end time).
- `src/test/immutable-ledgers-audit.test.tsx` — **new** 20-case verification
  suite.
- `src/test/issue-custody-return-chain.test.tsx:132` — one assertion updated:
  the asset movement ledger's requested `pageSize` is the shared default `10`
  after F-1, not the removed hardcoded `20`. Every sibling cross-module suite
  already asserted `pageSize: '10'`, so this change aligns the outlier with the
  app-wide convention rather than relaxing an expectation. The rest of the
  journey assertion is unchanged.
