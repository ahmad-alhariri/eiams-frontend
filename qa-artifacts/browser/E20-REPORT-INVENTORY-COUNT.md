# Browser-QA Report — Inventory count module (epic eiams-frontend-e20) + receiving smoke

- Date: 2026-08-26 · Branch `feat/issue-module-e16` (post-merge of origin/main `26d1097`) · Harness `scripts/qa/devtools-mcp.mjs` + persistent Chrome CDP :9223
- Dev server: Vite + browser-MSW at `http://localhost:5173` (auto-auth sysadmin, Enterprise scope)
- Trigger: main advanced during the epic (receiving e13 landed via PR #3 from a parallel branch); this pass verifies both the merged tree and cross-module coexistence.

## Step results — inventory count module (e20)

| Step | Verdict | Evidence |
|---|---|---|
| A — Count list `/counts` | **PASS** | Server-paged table renders 2 seeded sessions (EIAMS-CNT-2026-0001 جارية / -0002 مخططة) with type, scope summary, line/variance columns; status filter + create CTA present (`e20-01`) |
| B — Detail of InProgress session | **PASS** | Spine shows الحالة=جارية, SoftFreeze policy chip, scope أجهزة الحاسوب والطابعات; quantity workspace loads 3 lines with book quantities (25/2/12) and live-difference columns (`e20-02`) |
| C — Live variance math | **PASS** | Entering 23 on a book quantity of 25 flips the row difference to **-2** instantly, summary ذات فرق=1 / إجمالي الفرق=-2, save badge counts dirty lines only |
| D — Batched partial save | **PASS** | Save sends only changed lines (badge حفظ (2)); after success badges reset to حفظ (0) with «لا تغييرات غير محفوظة.» — partial-count persistence works |
| E — Variance review sync | **PASS** | Review strip updates to مطابقة=1 / ذات فرق=2; saved reason «تالف أثناء الجرد» renders under its line; unsaved lines show «لم يُدخل سبب الفرق بعد.» |
| F — Complete gate | **PASS** | «إكمال الجلسة» disabled while any variance line lacks a reason («لا يمكن إكمال الجلسة قبل إدخال سبب لكل بند ذي فرق»); enables once all reasons are captured |
| G — Complete lifecycle | **PASS** | Confirm dialog → POST complete → الحالة flips to مكتملة with اكتملت في timestamp stamped; entry inputs disappear (read-only review) (`e20-03`) |
| H — Close lifecycle | **PASS** | Confirm dialog → POST close → الحالة مغلقة with أُغلقت في stamp; both lifecycle buttons gone afterwards (`e20-04`) |
| I — Active-count warning | **PASS** | On `/counts/new`, selecting المستودع المركزي surfaces «يوجد جرد جارٍ لهذا المستودع بالفعل (جارية — EIAMS-CNT-2026-0001)…» before any form fill |
| J — One-session-per-warehouse 409 surfaced | **PASS** | Planning جرد شامل for the same warehouse → submit blocked with «تعذّر إنشاء جلسة الجرد… عدم وجود جلسة جارية لنفس المستودع» (mock 409 path exercised end-to-end) |
| K — SpotCheck bypass + plan success | **PASS** | جرد مفاجئ submits successfully → SPA-navigates to new detail page EIAMS-CNT-2026-0104 (مخططة, SoftFreeze, كل المواد) (`e20-05-planned-spotcheck`) |
| L — Tablet layout 768px | **PASS** | Count list at 768×1024 has no horizontal overflow (689/689 px) (`e20-06`) |
| M — Console sanity | **PASS** | 0 console errors across all steps |

## Step results — receiving module smoke (post-merge, main's e13)

| Step | Verdict | Evidence |
|---|---|---|
| N — Receiving list renders after merge | **PASS** | Seeded EIAMS-RCV-2024-0001 (مسودة) lists with filters and create CTA (`e20-qa-02-receiving-docs-list`) |
| O — Receiving detail + policy gate | **PASS** | Submit-for-posting advances مسودة→بانتظار الترحيل (الإصدار: 2, lifecycle event logged); ترحيل stays disabled with server-policy reason «يجب إرفاق النسخة الموقعة من المستند قبل الرصد.» — signed-original gate intact after merge (`e13-01`) |

## Notes
- Mock DB re-seeds on full reload: the planned SpotCheck session in step K exists within one SPA session.
- Two benign lint notices exist in code (React Compiler "Compilation Skipped" on RHF `watch`; pre-existing) — no runtime impact observed.
- Merge-resolution validation: our branch's receiving implementation was kept over main's divergent copy; step O confirms main's test expectations (lifecycle history, policy blockers) still hold through the shared handlers.

## Verdict
**INVENTORY_COUNT_MODULE_VERIFIED** — merge of `origin/main` into `feat/issue-module-e16` is behaviorally clean for both modules.

Artifacts: `qa-artifacts/browser/e20-*.png`, `e13-01-receiving-policy-gate.png` (screenshots gitignored by design; this report is the durable record).
