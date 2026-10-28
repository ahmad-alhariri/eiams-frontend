# EIAMS Reports & Dashboards Module (epic `eiams-frontend-e23`)

Read-only, server-authoritative projections surfaced under a single Arabic route
`/reports`. Implements five contracted reports (one tab each) plus the recent
activity panel and the dashboard counters.

## Architectural constraints (D-RPT-01, `docs/reports-kpi-contract-decision.md`)

- The `/reports` route is gated by `ROUTE_METADATA.reports.permissions = ['report.view']`.
  This module does **not** double-check the permission at the page level —
  `RouteAccessGuard` already enforces it.
- Every report forwards **only** the parameters declared by its operation
  (`/reports/inventory`, `/reports/assets`, `/reports/count-adjustments`,
  `/reports/documents`) or by the existing inventory movement ledger read
  (`/inventory/movements`). No fabricated defaults, no client-side filters that
  alter server scope/query semantics.
- The "stock movement report" is the existing immutable inventory movement
  ledger presented under the Reports navigation. **No `/reports/movements`
  endpoint exists** (D-RPT-01 §"V1 contract matrix", stock movement report
  row). The module reuses `useStockMovementsQuery` from `@/modules/inventory`
  verbatim.
- No client-side aggregation, no KPI inference, no client-built export/print.
  Server owns every business number.
- The recent activity panel composes two separately-permissioned existing
  reads (audit + low-stock balances). It never combines them into a new
  aggregate score, and every section is hidden when the caller lacks its
  permission.

## The live contract is the wire (D-INT-02, ADR-0001)

Every type in `types/reports.types.ts` is transcribed from the backend record
it describes — `Application/Reports/{Inventory,Assets,CountAdjustments,Documents,Dashboard}`
— and verified against the running API. The frozen generated snapshot
(the generated artifact, since deleted) described a DIFFERENT world for these
endpoints and is not the wire:

| Snapshot (not the wire)              | Live (the wire)                                          |
| ------------------------------------ | -------------------------------------------------------- |
| asset rows with material + custodian | one row per (warehouse, current status) with a COUNT     |
| adjustment / warehouse document rows | per-warehouse summary counters                           |
| dashboard of KPI codes + series      | a singleton of flat counters (`DashboardReportResponse`) |
| zero-based `pageIndex`               | ONE-based `page` (`PaginationQueryParameters.Page`)      |

Consequences worth knowing before editing this module:

- The four list endpoints answer with a bare `data` array plus a SIBLING
  `pagination` block, so `transport.requestPage` reads them and the page the
  UI sees is the FLAT `ApiPage` (`items`/`page`/`totalItems`/`totalPages`) —
  there is no `page.meta`.
- The dashboard carries **no series**, so the module has no chart surface:
  `components/dashboard-charts.tsx` was deleted rather than kept as a
  permanently empty frame. `dashboard-kpis.model.ts` labels the live counters
  for `KpiGrid` and computes nothing.
- A counter the server withholds arrives as `null` and is OMITTED, never
  rendered as zero (D-RPT-02 §4.1).

## External blockers (NOT implemented in this wave)

- `eiams-frontend-opv2` (P1 decision) — export/print contract. Until
  ratified, no export button is rendered and no print layout is shipped.

## File map

```
src/modules/reports/
├── components/
│   ├── asset-report-table.tsx              ← e23-t07
│   ├── count-adjustment-report-table.tsx   ← e23-t08
│   ├── dashboard-panel.tsx                 ← e23-t02/t03 (live counters)
│   ├── inventory-balance-report-table.tsx  ← e23-t05
│   ├── kpi-grid.tsx                        ← KPI card grid
│   ├── operational-documents-report-table.tsx ← e23-t09
│   ├── recent-activity-panel.tsx           ← e23-t04
│   ├── reports-tabs.tsx                    ← accessible tabs primitive
│   └── stock-movement-report-table.tsx     ← e23-t06 (reuses inventory ledger)
├── hooks/
│   └── use-reports-queries.ts               ← TanStack Query hooks, scope-keyed
├── pages/
│   └── reports-page.tsx                     ← /reports route entry, lazy-loaded
├── services/
│   └── reports.service.ts                  ← contract-backed axios transport
├── types/
│   └── reports.types.ts                    ← query types derived from operations
└── dashboard-kpis.model.ts                 ← live counters → KPI card labels
```

## Reused shared infrastructure

- `PageHeader` (with `toolbar` slot for filters)
- `ContentCard`
- `EmptyState`, `ErrorState`, `StatusBadge`
- `DataTableServer` + `ServerPaginationControls`
- `useServerPagination`
- `useScopedWarehouseSelector`, `useScopedMaterialSelector`
- `InventoryLowStockBadge` (low-stock inline presentation)
- `KpiCard` / `KpiValue` from `@/shared/ui/kpi-card`
- `OPERATIONAL_STALE_TIME` from `@/shared/services/query.client`
- `queryKeys` scope-key factory

No new shared primitive was added. The `ReportsTabs` component lives in
`src/modules/reports/components/reports-tabs.tsx` because no other module
currently needs it; promote to `@/shared/ui/tabs` once a second consumer
appears.

## Fixtures

The suites build their own MSW handlers over `@/test/msw/envelope`
(`okJson` / `okPageJson`), which emit the REAL backend envelope. There is no
`src/mocks/` runtime mock layer any more — `@/test/**` is the harness, not a
profile. Each report suite keeps a local fixture for the LIVE row shape rather
than reaching for a shared factory, because the report rows are summary
projections that no other module's factory produces.

## Tests

`vitest run src/modules/reports` covers:

- Service-level: documented params forwarded, `undefined` keys never sent, the
  dashboard sending only the filter its controller binds.
- Page shell: accessible tabs, default selection, tab switching.
- Each report table: Arabic rendering of the LIVE row fields, contracted
  filter forwarding, empty state, error state, retry.
- Dashboard: the server counters on the cards, no series surface, server
  timestamp, loading and error states.
- Recent activity panel: both sections when both perms held; sections
  hidden when the corresponding perm is missing; no synthetic empty state.
- Stock movement report: hits `/inventory/movements`, never a fabricated
  `/reports/movements`.

46 tests, 11 test files.
