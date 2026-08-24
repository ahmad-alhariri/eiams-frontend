# Browser-QA Report — Custody & Return module verification (bead eiams-frontend-e19-t09)

- Date: 2026-08-24 · Branch `feat/issue-module-e16` @ `781fb36`+ · Harness `scripts/qa/devtools-mcp.mjs` + persistent Chrome CDP
- Dev server: Vite + browser-MSW at `http://localhost:5173` (auto-auth sysadmin, Enterprise scope)

## Step results

| Step | Verdict | Evidence |
|---|---|---|
| A — Pending list `/custody/pending` | **PASS** | 1 Operational row for AST-2023-C099 (مديرية النقل والحراسة, نشطة) + custody.assign-gated تكليف موظف action (`e19-01`) |
| B — Assignment dialog open/cancel | **PASS** | Dialog «تكليف حفظ شخصي» opens naming the asset; confirm enabled only with a valid Employee; cancel closes (`e19-02`) |
| C — Active list `/custody/active` | **PASS** | Same row via unified /custodies handler: تشغيلي kind + نشطة badge + عرض التفاصيل link (`e19-03`) |
| D — Custody detail + transfer card | **PASS** after DEFECT-01 fix | Spine fields (holder/kind/fromTs/issue doc ref), status badge, and مبادلة المسؤولية card render for an Active row under custody.assign (`e19-04`) |
| E — Transfer dialog | **PASS** | «مبادلة مسؤولية العهدة» opens with holder select + reason + confirm (`e19-05`) |
| F — Return draft form `/documents/return/new` | **PASS** after DEFECT-02 fix | ReturnInfo petal (original issue id/ref/reason), spine header, lines editor all present; full happy-path submit posts the contract-shaped draft and navigates to the detail route (`e19-06`) |
| G — Return detail + lifecycle | **PASS** | Read-only petal rows (سند الصرف الأصلي / ISSUE-2025-0007 / سبب الإرجاع), Draft status chip from the shared shell's policy-driven lifecycle bar (`e19-07`) |
| H — Immutable custody history `/assets/{id}/custody` | **PASS** | Newest-first read-only timeline incl. closed operational row + active personal row; explicit read-only notice; zero mutation buttons; back-link to asset detail (`e19-08`, tablet `e19-09`) |

## Console / network
- 0 console errors across steps A–H.
- One in-page fetch probe confirmed `/custodies` returns 200 with stable deterministic ids.

## Defects found & fixed during verification
1. **DEFECT-01 (P1)** — Custody detail always errored: browser mock generated a *fresh random* `custodyId`
   per request, so the detail page re-fetching the list never resolved the navigated-from row.
   **Fix** (`781fb36`): deterministic per-asset custody ids (`deterministicCustodyId`) shared by the
   unified `/custodies` handler and the per-asset timeline handler. Re-verified D/E PASS live.
2. **DEFECT-02 (P2)** — Return submission blocked by capability gate: seeded central warehouse lacked
   `Return` operation for تقنية المعلومات. **Fix**: added `'Return'` to the IT-domain warehouse
   capability seed. Re-verified F/G PASS live.

## Verdict
**CUSTODY_RETURN_MODULE_VERIFIED**

Artifacts: `qa-artifacts/browser/e19-0*.png` (screenshots are gitignored by design; this report is the durable record).
