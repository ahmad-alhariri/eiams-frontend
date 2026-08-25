# Browser-QA Report — Atomic transfer module verification (bead eiams-frontend-e17-t07)

- Date: 2026-08-24 · Branch `feat/issue-module-e16` · Harness `scripts/qa/devtools-mcp.mjs` + persistent Chrome CDP :9223
- Dev server: Vite + browser-MSW at `http://localhost:5173` (auto-auth sysadmin, Enterprise scope)

## Step results

| Step | Verdict | Evidence |
|---|---|---|
| A — Transfer list `/documents/transfer` | **PASS** | Seeded Posted transfer EIAMS-TRF-2024-0001 renders (المستودع المركزي → مرحّل) with سند تحويل جديد create CTA (`e17-01`) |
| B — Draft form surface `/documents/transfer/new` | **PASS** | Spine header (نوع المستند = إشعار تحويل), جهة التحويل petal (destination picker + reason), بنود التحويل lines editor (`e17-02`) |
| C — Capability gate live | **PASS** | Selecting a material whose domain lacks the Transfer capability blocks the line with «المستودع لا يمتلك قدرة "تحويل" لمجال "الوثائق والمالية".» — the t05 gate firing in a real session (`e17-04`) |
| D — Balance ceiling live | **PASS** | Quantity above the seeded source balance blocks save: «الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح في المستودع المصدر (0).» with the save button disabled (`e17-04`) |
| E — Happy-path submit → detail | **PASS** | Valid form (source المركزي, destination الفرع الشمالي, reason, حاسوب مكتبي ×5 within balance): POST succeeds, SPA-navigates to the detail route showing the read-only petal (مستودع الفرع الشمالي / reason) + مسودة chip + إرسال للترحيل lifecycle action (`e17-03`) |
| F — Draft persists in list | **PASS** | SPA-nav back to the list shows both rows: Posted seed + the new Draft |
| G — Console sanity | **PASS** | 0 console errors across all steps |
| H — Tablet layout | **PASS** | 768×1024 list renders without horizontal overflow (`e17-05`) |

## Notes
- The browser mock database is in-memory per page load: full navigations re-seed. Persistence was
  verified within one SPA session (create → detail → back-to-list shows the Draft); an API-level
  probe additionally confirmed `POST /warehouse-documents` → subsequent `GET ?documentType=Transfer`
  returns the created Draft.
- During verification two mock-realism gaps were fixed earlier in the epic (deterministic custody
  ids, Return capability seed) and one now: the central warehouse's computers balance was seeded at
  0 which made every transfer attempt over-balance; bumped to 25/Sufficient so the happy path is
  demonstrable.

## Verdict
**ATOMIC_TRANSFER_MODULE_VERIFIED**

Artifacts: `qa-artifacts/browser/e17-0*.png` (screenshots gitignored by design; this report is the durable record).
