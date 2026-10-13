# Browser QA — inventory reads (eiams-frontend-whhu.18)

**Date:** 2026-10-13
**Profile:** `real-backend` (RESOLUTION-040). `VITE_AUTH_BYPASS=false`, proxies to the live API on
`:5000`. This run **is** integration evidence, unlike the earlier `ui-sandbox` run.
**Method:** chrome-devtools MCP. Real credentialed login, real wire traffic.

## Environment actually used

| Component | State |
| --- | --- |
| Frontend | Vite on `:5173`, proxying `/api/v1` → `http://localhost:5000` |
| Backend | Kestrel on `:5000`, fixed build |
| Database | PostgreSQL 18 on `:5432` |
| Session | `qa1791835845`, role `WH_KEEPER`, scope `Alepo Store 1791241674491` |

## Defects found and fixed during this QA

### B-01 (blocker, backend) — inventory list endpoints returned 500
`GET /inventory/balances` and `GET /inventory/movements` returned **500** for every valid query.
EF Core could not translate `ORDER BY` over a positional-record projection
(`new InventoryBalanceReadRow(...).WarehouseName`). Unit tests passed (697) because they never
execute a translated query with real join cardinality.

Fixed by converting both projections to member-init classes (`InventoryBalanceReadRow`,
`StockMovementReadRow`) so EF can substitute projected members into `ORDER BY` and keep sorting
server-side. The low-stock CASE moved into `ToResponse()` — still one database snapshot, still exact
`decimal` semantics.

**Both endpoints now return 200 for all sorts and filters.** Invalid sort values correctly return 400.

### B-02 (major, frontend) — zero-based `pageIndex` sent to a one-based `page`
`inventory-balances-page.tsx` and `stock-movements-page.tsx` sent `pageIndex: currentPage - 1`.
The backend binds `Page` (one-based, default 1), so `pageIndex` was silently ignored and **every
page request returned page 1** — pagination could never advance.

Fixed to `page: currentPage`, per D-INV-READ-01. Verified on the wire:
`GET /inventory/balances?page=1&pageSize=10&sortBy=WarehouseDisplayName&sortDirection=Ascending` → 200.

Three cross-module integration tests and two page tests asserted the broken value; updated to the
corrected contract. This is the work described by open bead `eiams-frontend-ri48`.

## Live contract verification (14/14 pass)

| Probe | Result |
| --- | --- |
| balances list | 200 |
| balances `sortBy=Quantity&sortDirection=Descending` | 200 |
| balances `sortBy=LastUpdated&sortDirection=Ascending` | 200 |
| balances `lowStockState=NotConfigured` | 200 |
| balances `lowStockState=Disabled` | 200 |
| balances `lowStockState=Low` | 200 |
| balances `sortBy=Bogus` | **400** (never a silent default) |
| movements `sortBy=PostedAt&sortDirection=Descending` | 200 |
| movements `sortBy=PostedAt&sortDirection=Ascending` | 200 |
| movements `sortBy=QuantityDelta&sortDirection=Ascending` | 200 |
| movements `sortBy=MovementType&sortDirection=Descending` | 200 |
| movements `sortBy=nope` | **400** |
| unknown `balanceId` | **404** |
| unknown `movementId` | **404** |
| no token | **401** |

## UI verification

| Check | Result |
| --- | --- |
| Real login → session → RBAC nav | Pass. Inventory links appear for `WH_KEEPER`; correctly absent for `SYSTEM_ADMIN`, which lacks `inventory.view`. |
| Warehouse scope resolution | Pass. Sidebar shows `Alepo Store 1791241674491`. |
| Empty state, balances + movements | Pass. Genuine Arabic empty state: «لا توجد أرصدة مخزون» / «لا توجد حركات مخزون». |
| RTL layout | Pass. Sidebar right, content left, logical alignment correct. |
| Console errors | None on either route. |
| Lighthouse accessibility (balances) | **100**. Best Practices 100. |
| Responsive 390×844 | Pass. Sidebar collapses to hamburger, filters stack, no overflow or clipping. |

## Open findings (not fixed here — out of whhu.18 scope)

- **MAJOR — `SYSTEM_ADMIN` is the only role without `inventory.view`** (AUDITOR, WH_KEEPER, WH_MGR all
  have it). A structural administrator cannot read inventory. Owned by open bead `8haa`.
- **MAJOR — date inputs render `mm/dd/yyyy` LTR-aligned** inside the Arabic RTL form, with English
  accessible names. i18n/a11y defect on the movements filter row.
- **MAJOR — the balance/movement detail pages have no `<h1>` in their error branch**, so the page loses
  its heading on failure. Unit tests only assert the heading on the success path.
- **MAJOR — a 401 is reported as «تحقق من الاتصال»** (check your connection). The correct Arabic copy
  already exists in `error-copy-ar.ts` but `titleAr` is discarded.
- **UNVERIFIED — low-stock projection values.** The scoped warehouse has zero balances, so the CASE
  only ever produced `NotConfigured` rows. Creating a balance requires a posted warehouse document,
  i.e. the `whhu.19` spine. Blocked behind that bead, not skipped.

## Gates

- Frontend `pnpm run quality`: **exit 0** — 298 files / 2214 tests, build OK, format clean, lint 0 errors
  (4 pre-existing warnings).
- Backend Release build: clean. Application.UnitTests **697/697**, ArchitectureTests **30/30**.
- IntegrationTests cannot run: Docker unavailable.