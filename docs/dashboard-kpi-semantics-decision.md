# EIAMS v1 Dashboard KPI and Series Semantics Decision

> **Status:** Ratified
> **Decision ID:** D-RPT-02
> **Supersedes:** `D-RPT-01` §"Dashboard response surface" — ratifies the blocked KPI/series vocabulary that was deferred to this decision.
> **Bead:** `eiams-frontend-4kd7`
> **Decision date:** 2026-09-25
> **Contract baseline:** `contracts/openapi/eiams-v1.openapi.json`, provenance `1.0.0-provisional.9`
> **Provenance supplement:** `contracts/openapi/eiams-v1.kpi-vocabulary.json`

---

## 1. Decision

Ratify the complete v1 KPI code vocabulary, Arabic labels, business semantics, units, and series bucket definitions for `GET /reports/dashboard`.

The frontend must render only the returned `code`, `labelAr`, `value`, `unitAr`, and `changePercent` fields as supplied by the server. It must not infer business meaning from a code string, recalculate a percentage, or substitute a missing KPI with a zero or default. The server owns all aggregation logic, date-boundary interpretation, and no-data treatment.

The `x-kpi-semantics` extension on `KpiValue` and `DashboardSeriesPoint` in the OpenAPI contract is the authoritative machine-readable vocabulary registry. This document is the human-readable rationale and ratification evidence.

---

## 2. KPI Code Vocabulary

Every KPI code is scoped to the active scope (Enterprise / Site / Warehouse) as selected by the server for the authenticated session. `dateFrom` and `dateTo` bound the period KPIs; non-period KPIs (balance, asset counts) reflect the current snapshot at `generatedAt`.

### 2.1 Period KPIs

Period KPIs compute over the `dateFrom`–`dateTo` window selected by the user in the dashboard filter toolbar.

| Code | labelAr | Business meaning | unitAr | Formula description | changePercent semantics |
|---|---|---|---|---|---|
| `documents_posted` | المستندات المرحّلة | Count of posted warehouse documents within the period | مستند | `COUNT(WarehouseDocument)` WHERE `status = 'Posted'` AND `postedAt` ∈ [dateFrom, dateTo], scoped to active scope | Percentage change vs. equivalent prior period (server-defined) |
| `movements_count` | عدد الحركات | Total count of stock movements within the period | حركة | `COUNT(StockMovement)` WHERE `postedAt` ∈ [dateFrom, dateTo], scoped | Percentage change vs. equivalent prior period |
| `items_received` | إجمالي الاستلامات | Count of receiving documents posted within the period | مستند | `COUNT(WarehouseDocument)` WHERE `documentType = 'Receiving'` AND `status = 'Posted'` AND `postedAt` ∈ [dateFrom, dateTo], scoped | Percentage change vs. equivalent prior period |
| `items_issued` | إجمالي عمليات الصرف | Count of issue documents posted within the period | مستند | `COUNT(WarehouseDocument)` WHERE `documentType = 'Issue'` AND `status = 'Posted'` AND `postedAt` ∈ [dateFrom, dateTo], scoped | Percentage change vs. equivalent prior period |
| `adjustments_count` | عدد التسويات | Count of adjustment documents posted within the period | تسوية | `COUNT(WarehouseDocument)` WHERE `documentType = 'Adjustment'` AND `status = 'Posted'` AND `postedAt` ∈ [dateFrom, dateTo], scoped | Percentage change vs. equivalent prior period |

### 2.2 Snapshot KPIs

Snapshot KPIs reflect the current state at the time the dashboard is generated, regardless of the date range filter.

| Code | labelAr | Business meaning | unitAr | Formula description |
|---|---|---|---|---|
| `total_balance_items` | أرصدة المواد النشطة | Count of materials that have a non-zero balance in the scoped warehouse(s) | عنصر | `COUNT(DISTINCT material_id)` FROM `InventoryBalance` WHERE `quantity ≠ 0`, scoped to active scope |
| `total_stock_quantity` | إجمالي الكمية بالمخزون | Sum of all inventory quantities across scoped warehouse(s) | وحدة | `SUM(InventoryBalance.quantity)`, scoped to active scope. `unitAr` is `null` because this is a heterogeneous sum of mixed-material quantities — no single unit applies. |
| `active_assets` | الأصول النشطة | Count of assets in a non-Disposed derived state | أصل | `COUNT(Asset)` WHERE server-derived `derivedStatus ≠ 'Disposed'`, scoped to active scope |
| `open_custodies` | التكليفات النشطة | Count of active custody records | تكليف | `COUNT(Custody)` WHERE `status = 'Active'`, scoped to active scope |
| `pending_documents` | المستندات المعلقة | Count of documents in Draft or Submitted status (not yet posted) | مستند | `COUNT(WarehouseDocument)` WHERE `status IN ('Draft', 'Submitted')`, scoped to active scope |
| `low_stock_count` | المواد قرب النفاد | Count of materials at or below their low-stock threshold | عنصر | `COUNT(DISTINCT material_id)` FROM `InventoryBalance` WHERE `lowStock.state = 'Low'`, scoped to active scope |

---

## 3. Series Bucket Definitions

### 3.1 movementTrend

`movementTrend` is an ordered array of `DashboardSeriesPoint` representing stock movement activity bucketed by the server.

| Field | Value |
|---|---|
| **Bucket unit** | Daily (one point per calendar day in [dateFrom, dateTo]) |
| **label** | Arabic date string formatted per the server locale, e.g. `"١٥ محرّم ١٤٤٥"` or `"2026-01-15"`. The server decides the format; the frontend renders it as returned. |
| **value** | Count of `StockMovement` rows posted on that day, scoped to active scope |
| **Ordering** | Chronological, oldest first |
| **Empty days** | Included with `value = 0` so the frontend can render continuous charts |
| **No-data period** | If `dateFrom`–`dateTo` encompasses a period before the system was operational, those days are included with `value = 0` |

### 3.2 assetStatusDistribution

`assetStatusDistribution` is an ordered array of `DashboardSeriesPoint` representing the current distribution of asset derived statuses.

| Field | Value |
|---|---|
| **label** | Arabic label for the derived status: `"في المخزن"` (InStock), `"مُصرَّف"` (Issued), `"بعهدة"` (InCustody), `"مُستبعد"` (Disposed) |
| **value** | Count of assets with that `derivedStatus`, scoped to active scope |
| **Ordering** | Server-defined; the frontend renders in the returned order |
| **Zero-count status** | Included with `value = 0` so charts reflect the full status set |
| **Unknown status** | If the server returns a `derivedStatus` not in the canonical set, the frontend renders the raw `label` as returned without mapping or rejection |

---

## 4. Null, Zero, and No-Data Treatment

### 4.1 KPI values

| Condition | Server behavior | Frontend rendering |
|---|---|---|
| KPI has no data for scope | `value = 0` | Render `0` with normal formatting. `changePercent` is `null`. |
| Period outside operational range | `value = 0` | Render `0`. `changePercent` is `null`. |
| `unitAr` not applicable | `unitAr = null` | Omit unit display; render value only. |
| `changePercent` undefined | `changePercent = null` | Do not render a trend indicator. |
| `changePercent = 0` | Explicit zero | Render `0%` with neutral indicator. |
| KPI not in scope for server | Omitted from `kpis[]` | Not rendered. The frontend renders exactly what the server returns; it must not synthesize a missing KPI. |

### 4.2 Series points

| Condition | Server behavior | Frontend rendering |
|---|---|---|
| Day with no movements | `value = 0` in array | Render zero-height bar/point. Include in chart axis. |
| Status with no assets | `value = 0` in array | Render zero-value pie segment or absent segment per chart library convention. Include in legend. |
| Series empty | `[]` (empty array) | Render empty state: "لا توجد بيانات حركات للمدة المحددة." Do not show an empty chart frame. |

---

## 5. changePercent Semantics

`changePercent` is a server-computed percentage comparing the current period to the equivalent prior period.

- **Numerator:** KPI `value` for [dateFrom, dateTo]
- **Denominator:** KPI `value` for the equivalent prior period (server-defined: same day-count immediately before `dateFrom`)
- **Calculation:** `((current - prior) / |prior|) * 100`, rounded to 1 decimal place
- **Special cases:**
  - `prior = 0, current > 0` → `changePercent = null` (no computable percentage; server returns `null`)
  - `prior = 0, current = 0` → `changePercent = 0`
  - `prior < 0` → behavior is server-defined; frontend renders the returned value as-is
- **Frontend rule:** Render `changePercent` exactly as returned. Do not recalculate, reformat to more decimals, or reinterpret a `null` as zero.

---

## 6. Query Parameters

The frontend sends only these parameters to `GET /reports/dashboard`:

| Parameter | Type | Source | Notes |
|---|---|---|---|
| `siteId` | UUID (nullable) | Active scope context; `null` means Enterprise scope | Frontend sends `siteId` from the active session scope; absent when scope is Enterprise |
| `warehouseId` | UUID (nullable) | Dashboard warehouse filter; `null` means all warehouses in scope | User may select one specific warehouse or `null` for all |
| `dateFrom` | ISO 8601 date-time | Dashboard date-from control | Inclusive; server defines the time component (typically `00:00:00`) |
| `dateTo` | ISO 8601 date-time | Dashboard date-to control | Inclusive; server defines the time component (typically `23:59:59`) |

**Frontend rules:**
- All four parameters are sent even when `null` — the server applies its own defaults for omitted optional parameters
- `pageIndex` and `pageSize` are **not** sent to this endpoint (it is not a paginated response)
- The frontend does not substitute "all warehouses" when `warehouseId` is `null` — the server interprets `null` as "apply to all scoped warehouses"

---

## 7. OpenAPI Impact

The KPI vocabulary is registered in the OpenAPI contract as `x-kpi-semantics` extension values on `KpiValue` and `DashboardSeriesPoint`. The machine-readable registry is at `contracts/openapi/eiams-v1.kpi-vocabulary.json`.

Changes to any ratified KPI code, label, or series bucket constitute a **breaking semantic change** even if the TypeScript type still compiles. Such changes require:

1. A version bump in `eiams-v1.openapi.json` (`x-semantic-version` increment)
2. An update to `contracts/openapi/eiams-v1.provenance.json` with a ratification entry
3. A new decision bead documenting the change rationale
4. Backend/API owner sign-off
5. MSW fixture regeneration

---

## 8. Frontend Implementation Rules (for downstream consumers t02 and t03)

1. **Render exactly what the server returns.** Map `code` to display logic only for the canonical set in §2; unknown codes render the raw `labelAr` without falling back to a generic label.
2. **Never infer formula or aggregation from a code string.** The `code` is an opaque identifier; the display label is `labelAr`.
3. **Never calculate `changePercent` in the browser.** Render the value as returned by the server.
4. **Always render a data table equivalent for every chart.** Every chart must have an accessible tabular summary (visually hidden or alongside) so screen reader users and keyboard navigators can access the underlying numbers without interacting with the chart.
5. **Never show a chart frame for an empty series.** Render the empty state message instead.
6. **Use `OPERATIONAL_STALE_TIME` (30 seconds) for dashboard queries.** The dashboard is operational data, not master data.
7. **Filter reset:** Changing `siteId`, `warehouseId`, `dateFrom`, or `dateTo` must reset the `dateFrom`/`dateTo` controls to the server's effective defaults on scope change.
8. **Scope key:** Every dashboard query uses the active scope cache key so warehouse-level sessions do not see enterprise-level aggregates.
9. **Generated at:** Render `generatedAt` as a "last updated" timestamp in the page header; format with `formatDateTime()`.

---

## 9. Alternatives Considered and Rejected

| Alternative | Reason rejected |
|---|---|
| Browser computes changePercent from two separate API calls | Stale, scope-unsafe; the server must own the comparison window |
| Treat `code` as the display key and derive label from it | Coupling display to an opaque string; label drift would break the UI |
| Filter to "top 5" KPIs client-side | Server must own which KPIs are in scope; client filtering hides data the server computed |
| Line chart for assetStatusDistribution | Pie/donut is the correct chart type for a categorical distribution; line implies a time series |
| Show chart frame with "no data" message for empty series | Empty state is the correct pattern; a blank chart frame is not a valid data visualization |
| Default date range of "last 30 days" | Server owns date-default semantics; omitting `dateFrom`/`dateTo` means "no filter" |

---

## 10. Backend/API Owner Review Checklist

Before this decision is considered fully ratified, the backend/API owner must confirm:

- [ ] The eight KPI codes in §2 match exactly what the `getDashboardReport` implementation will return
- [ ] `changePercent` is computed server-side using the equivalent-prior-period definition in §5
- [ ] `movementTrend` buckets are daily and include zero-value days for gap-free charts
- [ ] `assetStatusDistribution` includes zero-count statuses in the returned array
- [ ] `generatedAt` reflects theUTC timestamp of report generation
- [ ] The server returns `null` (not `0`) for `changePercent` when the prior period has zero value
- [ ] Unknown derived statuses are returned as raw codes in `label` without rejection
- [ ] `unitAr = null` is returned for `total_stock_quantity` (heterogeneous quantity sum)
- [ ] The `x-kpi-semantics` extension values in `eiams-v1.openapi.json` match this document
- [ ] `eiams-v1.provenance.json` is updated with this ratification entry
