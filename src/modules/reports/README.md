# EIAMS Reports & Dashboards Module (epic `eiams-frontend-e23`)

Read-only, server-authoritative projections surfaced under a single Arabic route
`/reports`. Implements six contracted reports (one tab each) plus a recent
activity panel.

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

## External blockers (NOT implemented in this wave)

- `eiams-frontend-4kd7` (P1 decision) — dashboard KPI/series semantics.
  Until this decision is ratified, the dashboard tab surfaces the
  recent-activity + low-stock composition; no `KpiValue.code` inference.
- `eiams-frontend-opv2` (P1 decision) — export/print contract. Until
  ratified, no export button is rendered and no print layout is shipped.

## File map

```
src/modules/reports/
├── components/
│   ├── asset-report-table.tsx              ← e23-t07
│   ├── count-adjustment-report-table.tsx   ← e23-t08
│   ├── inventory-balance-report-table.tsx  ← e23-t05
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
└── types/
    └── reports.types.ts                    ← query types derived from operations
```

## Reused shared infrastructure

- `PageHeader` (with `toolbar` slot for filters)
- `ContentCard`
- `EmptyState`, `ErrorState`, `StatusBadge`
- `DataTableServer` + `ServerPaginationControls`
- `useServerPagination`
- `useScopedWarehouseSelector`, `useScopedMaterialSelector`
- `InventoryLowStockBadge` (low-stock inline presentation)
- `OPERATIONAL_STALE_TIME` from `@/shared/services/query.client`
- `queryKeys` scope-key factory

No new shared primitive was added. The `ReportsTabs` component lives in
`src/modules/reports/components/reports-tabs.tsx` because no other module
currently needs it; promote to `@/shared/ui/tabs` once a second consumer
appears.

## MSW handlers

The four `/reports/*` endpoints are registered in
`src/mocks/handlers.ts:mockApiHandlers` so the running app sees a stable
shape in development. The stock movement report reuses the existing
`/inventory/movements` handler — no new MSW registration required.

## Tests

`vitest run src/modules/reports` covers:

- Service-level: documented params forwarded, `undefined` keys never sent.
- Page shell: accessible tabs, default selection, tab switching.
- Each report table: Arabic rendering, contracted filter forwarding, empty
  state, error state, retry.
- Recent activity panel: both sections when both perms held; sections
  hidden when the corresponding perm is missing; no synthetic empty state.
- Stock movement report: hits `/inventory/movements`, never a fabricated
  `/reports/movements`.

24 tests, 8 test files.
