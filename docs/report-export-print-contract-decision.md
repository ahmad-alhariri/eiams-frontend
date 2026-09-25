# EIAMS v1 Report Export and Print Contract Decision

> **Status:** Ratified
> **Decision ID:** D-RPT-03
> **Ratifies:** `eiams-frontend-opv2` — blocks `e23-t10`
> **Reviewed by:** Product + Backend/API owner
> **Date:** 2026-09-25

---

## Summary

This decision ratifies the EIAMS v1 report export and print contract. It defines which reports support export and print, the endpoint contract for server-generated exports, the printable layout requirements, explicit rejections of client-side reconstruction, and the interim informal print behavior.

This decision is scoped to v1. Advanced export features (scheduled delivery, Excel with formulas, report subscriptions) are deferred to v2.

---

## Section 1 — Report Kinds and Their Export/Print Capabilities

The following matrix defines which export formats and print modes apply to each report type.

| Report Type | Official Export? | Export Formats | Official Print? | Informal Print? | Notes |
|---|---|---|---|---|---|
| Inventory Balance | ✅ Yes | PDF, CSV | ✅ Yes | ✅ Yes | Full-result export; filter-bound print |
| Asset & Custody | ✅ Yes | PDF | ✅ Yes | ✅ Yes | Personal data sensitivity; CSV excluded |
| Count Adjustment | ✅ Yes | PDF | ✅ Yes | ✅ Yes | Official record; full-result export |
| Stock Movement | ✅ Yes | PDF, CSV | ✅ Yes | ✅ Yes | Full-result export; filter-bound print |
| Operational Documents | ✅ Yes | PDF | ✅ Yes | ✅ Yes | Official record; full-result export |
| Dashboard (KPI) | ❌ No | — | ❌ No | ❌ No | Visual-only; not a legal document |

**Rationale:** Dashboard is excluded because it is a real-time aggregation that has no authoritative archival form. The KPI card values and charts are meaningful only in the context of the current session. Official audit records are derived from the underlying inventory/asset/movement tables, not the dashboard projection.

---

## Section 2 — Scope, Authorization, and Audit

### 2.1 Scope Safety

Export and print are **scope-bound**. The server enforces that the caller can only export data within their active scope (site/warehouse). The client MUST send the same scope parameters that are applied to the on-screen report.

- `siteId` and `warehouseId` are forwarded from the active scope context
- If no scope is active (e.g., system-wide admin), the server applies its own scope rules
- Exporting cross-site or cross-warehouse data without authorization is rejected by the server

### 2.2 Authorization

| Report | Required Permission |
|---|---|
| Inventory Balance export/print | `inventory.view` |
| Asset & Custody export/print | `asset.view` |
| Count Adjustment export/print | `inventory.view` |
| Stock Movement export/print | `inventory.view` |
| Operational Documents export/print | `document.view` |

The UI hides export/print controls when the caller lacks the required permission.

### 2.3 Audit Trail

Every export operation writes an audit log entry containing:
- User ID
- Timestamp (UTC)
- Report type
- Applied scope (site, warehouse)
- Filter parameters used
- Record count in exported result
- Download format
- Download URL (if applicable)

The audit entry is written by the **server**, not the client. The client cannot forge export audit records.

---

## Section 3 — Export Endpoint Contract

### 3.1 Endpoint Design

```
GET /reports/{reportType}/export
```

| Path parameter | Value | Notes |
|---|---|---|
| `reportType` | `inventory` \| `assets` \| `count-adjustments` \| `movements` \| `documents` | Matches the existing read endpoint path segment |

| Query parameter | Type | Required | Notes |
|---|---|---|---|
| `format` | `pdf` \| `csv` | Yes | Format selection |
| `dateFrom` | ISO 8601 date | No | Defaults to first day of current month |
| `dateTo` | ISO 8601 date | No | Defaults to current date |
| `warehouseId` | UUID | No | Scoped warehouse; omitted = all in scope |
| `siteId` | UUID | No | Scoped site; omitted = all in scope |

### 3.2 Response Codes

| Status | Condition | Body |
|---|---|---|
| `200` | Small report (< 5,000 rows) ready immediately | Binary PDF or CSV |
| `202` | Large report requires async processing | `{ "jobId": "uuid", "status": "processing" }` |
| `400` | Invalid format or missing required params | Problem Details JSON |
| `401` | Not authenticated | Problem Details JSON |
| `403` | Missing required permission | Problem Details JSON |

### 3.3 Async Job Polling

```
GET /reports/exports/{jobId}
```

| Status | Body |
|---|---|
| `processing` | `{ "jobId": "uuid", "status": "processing", "progress": 45 }` |
| `ready` | `{ "jobId": "uuid", "status": "ready", "downloadUrl": "/reports/exports/{jobId}/download", "expiresAt": "ISO 8601", "recordCount": 14287 }` |
| `failed` | `{ "jobId": "uuid", "status": "failed", "error": "message" }` |

- Polling interval: 2 seconds
- Download URL is valid for 24 hours and requires authentication
- Download URL must not be guessable (UUID v4 or equivalent)
- File name in `Content-Disposition` header: `EIAMS_{reportType}_{dateFrom}_{dateTo}.{ext}`

### 3.4 Content Types

| Format | Content-Type |
|---|---|
| PDF | `application/pdf` |
| CSV | `text/csv; charset=utf-8-bom` |

CSV uses UTF-8 with BOM to ensure Arabic characters open correctly in Excel.

---

## Section 4 — PDF Layout Specification

The PDF is rendered **server-side**. The client never constructs the PDF. The server applies the following layout:

### 4.1 Page Structure

```
┌──────────────────────────────────────────────────────┐
│ HEADER                                                │
│ [Company Logo]  [Report Title — Arabic]               │
│ Scope: [site name] / [warehouse name]                │
│ Generated: 25 سبتمبر 2026 at 10:30 AM                │
├──────────────────────────────────────────────────────┤
│                                                        │
│ [Report content — Arabic RTL, tabular]               │
│                                                        │
│                                                        │
├──────────────────────────────────────────────────────┤
│ FOOTER                                                │
│ Page 3 of 12  |  Classification: Internal           │
│ Generated by: ahmad@eiams.com | EIAMS v1.0.0         │
└──────────────────────────────────────────────────────┘
```

### 4.2 Header Requirements

- Company name (configurable, stored on server)
- Report title in Arabic (translated from report type key)
- Scope context: site name and warehouse name (or "جميع المخزون" if no warehouse filter)
- Generation timestamp in Arabic format (Gregorian and Hijri)
- Filter summary if non-default filters are applied

### 4.3 Footer Requirements

- Page X of Y (using Arabic numerals: ١ of ١٢)
- Document classification: `Internal` / `Confidential` (per report type)
- Generator user identifier
- EIAMS version

### 4.4 Table Formatting

- All tables use Arabic RTL direction (`dir="rtl"`)
- Column headers in Arabic, bold
- Alternating row backgrounds (white / Ivory Mist `#EDEBE0`)
- Grid lines: light gray `#E8ECF0`
- Font: system serif for Arabic text, monospace for numbers
- Page breaks: avoid splitting a row across pages (keep-row-together rule)

### 4.5 Accessibility

- PDF/UA tagged PDF for screen reader compatibility
- Document title in PDF metadata
- Language declared as `ar` (Arabic)

---

## Section 5 — Explicit Rejections

The following approaches are explicitly rejected for v1:

| Rejected Approach | Reason |
|---|---|
| Browser `window.print()` as official export | No scope guarantee, no legal header, no pagination contract, browser adds uncontrolled headers/footers |
| Client-side PDF generation from TanStack Query data | No server authority, no scope enforcement, client can filter/skip rows |
| Client-side CSV generation from table data | Same scope/authority problems; also encoding issues with Arabic |
| Export of visible paginated rows only | Misrepresents a page of data as a complete report |
| Export without scope context | Violates data governance and the scoped data model |
| Dashboard print or export | Dashboard is not an authoritative document; underlying tables are the system of record |

---

## Section 6 — Interim Informal Print (v1 Bridge)

While awaiting backend implementation of the export endpoints, the frontend MAY implement an **informal print** button on each report table (not on the dashboard). This is a UX convenience only and MUST NOT be represented as an official export.

### 6.1 Behavior

- Triggers `window.print()` with a scoped `@media print` stylesheet
- The print output shows the **currently visible filtered table** (same as what the user sees on screen)
- No server audit log is written
- No pagination guarantee
- Browser controls headers and footers

### 6.2 UI Requirements

| Element | Specification |
|---|---|
| Button label | "طباعة" |
| Icon | `Printer` (Tabler Icons — per ui-design.md §11 icon table) |
| Placement | Top-right of each report table toolbar |
| Scope | Only on report tables; NOT on dashboard |
| Visual indication | Button is styled consistently with the existing toolbar actions |
| Accessibility | `aria-label="طباعة هذا التقرير"` |

### 6.3 Rejection as Official Export

This button MUST be clearly understood as an informal convenience. The documentation and any user-facing copy must clarify:
- "هذه طباعة غير رسمية — للحصول على تقرير رسمي، استخدم التصدير بعد التحديث القادم للنظام"
- The print button is hidden when a formal export feature becomes available

---

## Section 7 — OpenAPI Impact

When the backend implements the export contract, the following must be added to `eiams-v1.openapi.json`:

1. **5 new path templates** (one per exportable report type):
   - `GET /reports/inventory/export`
   - `GET /reports/assets/export`
   - `GET /reports/count-adjustments/export`
   - `GET /reports/movements/export`
   - `GET /reports/documents/export`

2. **1 async job path:**
   - `GET /reports/exports/{jobId}`
   - `GET /reports/exports/{jobId}/download`

3. **New schemas:**
   - `ExportJob` — `{ jobId, status, progress?, downloadUrl?, expiresAt?, recordCount?, error? }`
   - `ExportFormat` — enum `pdf | csv`

4. **Provenance update:**
   - Add ratification entry in `contracts/openapi/eiams-v1.provenance.json`
   - Reference this document (D-RPT-03)

---

## Section 8 — Implementation Notes for e23-t10

Frontend implementation of `e23-t10` is unblocked by this decision. The following implementation sequence is recommended:

1. **Service layer:** `reports-export.service.ts` with `exportReport()` method handling 200 and 202 responses, polling for async jobs
2. **Export button component:** `src/shared/ui/export-button.tsx` — handles permission check, loading state, error state, and calls the export service
3. **MSW handlers:** Add mock `GET /reports/{type}/export` handlers returning fixture PDFs/CSVs for testing
4. **Print button (interim):** Per Section 6 above; hidden when formal export is available
5. **Provenance:** Updated to reference D-RPT-03

---

## Section 9 — v2 Deferred

The following are explicitly out of scope for v1 and should be revisited in the v2 planning cycle:

| Feature | Reason for deferral |
|---|---|
| Excel export with formulas and formatting | Requires Office Open XML spec work; Arabic Excel support complexity |
| Scheduled report delivery (email) | Notification system not yet in scope |
| Report subscriptions | Requires notification infrastructure |
| Custom report builder | Requires report schema design |
| Multi-language reports (English) | v1 is Arabic-only |
| PDF archive with digital signature | Requires PKI infrastructure |

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Formal Export** | Server-generated, scope-verified, audit-logged, legally authoritative export with ratified layout |
| **Informal Print** | `window.print()` triggered from the UI; browser-controlled output; not legally authoritative |
| **Full-result semantics** | Export returns ALL records matching the filter criteria, not just the visible page |
| **Scope-bound** | Operation is restricted to the caller's active site/warehouse scope |
| **PDF/UA** | ISO 14289-1 — accessible PDF with tagged content for screen readers |
| **Async export job** | Server-side export processing that requires polling for completion |
| **UTF-8 BOM** | Byte Order Mark (`0xEF 0xBB 0xBF`) prepended to CSV to signal UTF-8 encoding to Excel |
