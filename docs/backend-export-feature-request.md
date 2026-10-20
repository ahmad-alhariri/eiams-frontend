# Backend export feature request

> **Filed in the frontend repo** because, per the task instructions, the
> `eiams-backend` repo\'s `docs/` was already modified by another workstream
> (`docs/phase3a-material-base-unit-inventory.md`). Once that work merges and
> `docs/` is clean again, this file can move to
> `eiams-backend/docs/export-feature-request.md`.
>
> **Frontend bead:** `eiams-frontend-5ds2` (also titled "Backend: report
> export endpoints (5 routes) are not implemented; the UI export action is
> hidden until they exist", P1).

## Why

The frontend ships an `<ExportButton>` in every report table, but the live
backend serves no path whose name mentions "export". The action has been
hidden in every report table (`src/shared/ui/export-button.tsx`) so the UI
never offers a download the server cannot fulfil. Restore it when the
backend ships the routes listed below.

## What the live API exposes today (verified 2026-10-20)

`GET` paths under `/reports/...`:

- `/reports/assets`
- `/reports/count-adjustments`
- `/reports/dashboard`
- `/reports/documents`
- `/reports/inventory`

There is **no path** under any method whose name contains "export":

```
$ (Invoke-WebRequest 'http://localhost:5000/swagger/v1/swagger.json').Content |
    ConvertFrom-Json | Select-Object -ExpandProperty paths |
    Where-Object { $_.Keys -match 'export' }
# (no output)
```

So the endpoints the frontend already calls do not exist, and the drift
gate records a `knownDivergences` entry under `path: "/reports/exports"`
until they do.

## What the frontend needs

### Routes (5 export triggers + 1 job poll)

The five report-table export actions the frontend already calls:

1. `GET /reports/inventory/export` — inventory balance report.
2. `GET /reports/assets/export` — asset-by-warehouse report.
3. `GET /reports/count-adjustments/export` — adjustment variance report.
4. `GET /inventory/movements/export` — stock-movement ledger export.
5. `GET /reports/documents/export` — operational documents report.

Plus the polling companion:

6. `GET /reports/exports/{jobId}` — async-job status used by
   `pollExportJob()` in `src/modules/reports/services/reports-export.service.ts`.

### Request shape (already in the frontend; the live controller must accept
the same)

Every export route accepts the same query parameters the on-screen report
was built with, plus the requested format:

```
GET /reports/{kind}/export?format=pdf|csv
                  &dateFrom=YYYY-MM-DD
                  &dateTo=YYYY-MM-DD
                  &warehouseId={uuid}
                  &siteId={uuid}
```

Scope is server-enforced; the client cannot widen it. Filters mirror the
client screens (`ExportFilters` in
`src/modules/reports/services/reports-export.service.ts`).

### Response shape

The frontend distinguishes the sync and async paths by **payload** (not by
status code), because `ApiTransport.request<T>` resolves to the payload,
not the response. The implementation can answer either:

- **Synchronous (HTTP 200 OK)** — the rendered file body is the response
  (`application/pdf` for PDF, `text/csv` for CSV).
- **Asynchronous (HTTP 202 Accepted)** — JSON body shaped as
  `ApiResponse<ExportJobAccepted>` where
  `ExportJobAccepted = { jobId: string; status: 'processing' }`.
  The frontend then polls `/reports/exports/{jobId}` until the status is
  `'ready'` (carrying `downloadUrl`, `expiresAt`, `recordCount`) or
  `'failed'` (carrying `error`).

The transport ships both branches unchanged; the only difference is which
shape the controller answers with. The `Content-Disposition` header should
carry `EIAMS_{reportType}_{dateFrom}_{dateTo}.{ext}` per
`buildFilename()` in `reports-export.service.ts`.

## Where the frontend lives (do not touch when implementing this ticket)

- Service: `src/modules/reports/services/reports-export.service.ts`
- Mutation hook: `src/modules/reports/hooks/use-export-report.ts`
- Report tables calling `<ExportButton .../>`:
  `src/modules/reports/components/{asset,stock-movement,operational-documents,
  count-adjustment,inventory-balance}-report-table.tsx`
- Shared button (currently a no-op): `src/shared/ui/export-button.tsx`

## Acceptance criteria (backend work)

1. All five routes return a real file (sync) or `ApiResponse<ExportJobAccepted>`
   (async) for a permitted scope.
2. The job-status route answers the three-status union; `'ready'` carries a
   signed `downloadUrl` with an `expiresAt`.
3. The live swagger exposes the new paths under the `reports` /
   `inventory` tags so `pnpm run contract:drift` captures them and the
   `knownDivergences` entry under `/reports/exports` is removed.
4. Filters/scope/format match the contract documented above.
5. Audit log carries a per-export record so `D-RPT-03 §2.2` can show the
   operator who exported what.
