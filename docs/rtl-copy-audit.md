# Arabic RTL and copy audit

**Status:** Enforced by a source scan over the pinned production file set
**Bead:** `eiams-frontend-e25-t03`
**Date:** 2026-10-30 (measurements) - 2026-11-02 (fence implemented, measurements refreshed)
**Mechanism:** `src/test/rtl-copy-audit.test.ts` — a TypeScript-AST scan over the pinned production file set, with one synthetic negative control per detector

## How the measurements were taken

Every number below is a **measurement**, not an opinion, and every measurement is
reproducible from the tree alone.

The scan set is `applicationSourceFiles()` (which excludes `src/test/**` and
`src/contract-smoke/**`) minus `src/app/gallery/**`:

| Set | Files |
| --- | --- |
| `applicationSourceFiles()` | 415 |
| `src/app/gallery/**` (dev-only demo surface, out of scope) | 21 |
| **Scanned production set** | **394** |

The same 394 files are the set that `src/test/responsive-audit.test.ts` pins, so
the two fences cover exactly the same tree.

The numeric detector needs the **static type** of an interpolated expression, so
the scan builds the real TypeScript program from `tsconfig.app.json` (the same
compiler options `pnpm run typecheck` uses) and asks the checker for the type of
every JSX child expression. A source scan alone cannot tell `{quantity}` (a
number) from `{quantity.name}` (a string), and a name-based guess would miss the
classic violation the moment someone renamed the variable. The program is built
once per test file and shared by both detectors.

## The measurement

| Measurement | Value | How |
| --- | --- | --- |
| JSX child interpolations scanned | **1,198** | every `JsxExpression` whose parent is a `JsxElement`/`JsxFragment` |
| of those, typed `number` | **33** | `checker.getTypeAtLocation(expr).flags & ts.TypeFlags.NumberLike` |
| …inside a left-to-right run (`dir="ltr"`, or the shared `DetailField`'s `ltr` prop) | **7** | ancestor walk |
| …excused by a reviewed `standard-allow:` marker | **2** | `src/shared/ui/calendar.tsx` |
| **…user-visible numbers in Arabic context** | **24** | **fixed by this bead** |
| user-visible attribute literals scanned | **673** | 16 attribute names (below) |
| of those, containing Latin letters | **26** | `/[A-Za-z]/` |
| …of those, **corrupted Arabic** (mojibake) | **2** | **fixed by this bead** |
| …of those, technical examples | **24** | 20 recognised by shape, 4 carrying a reviewed marker |
| physical-direction CSS utilities in `src/` | **0** | owned by `src/test/responsive-audit.test.ts` (R5) |
| `--font-sans` / `--font-arabic` declared | **2** | `src/index.css:33-35` |
| `@fontsource-variable/noto-sans-arabic` imported | **1** | `src/index.css:5` |
| `html { @apply font-sans }` | **1** | `src/index.css:235-237` |
| `<html lang="ar" dir="rtl">` | **1** | `index.html:2` |
| `dir="rtl"` on the app shell | **1** | `src/shared/layout/app-layout.tsx:36` |

The 16 attribute names R2 reads: `alt`, `aria-description`, `aria-label`,
`aria-placeholder`, `aria-valuetext`, `cancelText`, `confirmText`,
`description`, `emptyMessage`, `errorMessage`, `header`, `helperText`, `label`,
`placeholder`, `title`, `tooltip`.

## The defects found

### D1 — two Arabic labels were corrupted into mojibake

`src/modules/organization/pages/site-detail-page.tsx:144` and `:147` rendered
their `DetailField` labels as Latin/Arabic-mixed garbage:

```
144:  <DetailField label="OٕU,O1U+U^OٕO+" …>
147:  <DetailField label="U.O1OٕU`U? OٕU,OٕUٕOc OٕU,U.OٕU,UٕOc" …>
```

The two strings are the ONLY places in the whole repository that contain
U+0655 (ARABIC HAMZA BELOW) — the fingerprint of the corruption. The damage
arrived with commit `2bd307f` ("refactor(repo): land the pending contract,
catalogue and document work"), which rewrote this page from a `<dl>` of
`<dt>`/`<dd>` pairs into `DetailField` components; the git diff of that commit
still carries the two originals:

```
-            <dt className="text-sm font-medium text-muted-foreground">العنوان</dt>
+          <DetailField label="OٕU,O1U+U^OٕO+" className="sm:col-span-2">
-            <dt className="text-sm font-medium text-muted-foreground">معرّف الجهة المالكة</dt>
+          <DetailField label="U.O1OٕU`U? OٕU,OٕUٕOc OٕU,U.OٕU,UٕOc" className="sm:col-span-2" ltr>
```

So the two labels are restored to the exact strings the page showed before the
refactor: **العنوان** and **معرّف الجهة المالكة**.

### D2 — 24 numbers the user reads were rendered in Western digits

Every one of these is a number inside an ARABIC sentence, a label, an
accessible name or a badge. Western digits in Arabic prose are the copy defect
this bead exists to close: the rest of the application already renders its
numbers in Arabic-Indic digits through `src/shared/utils/format.ts`
(`formatNumber`, `toArabicDigits`), and `src/shared/documents/document-policy-gates.ts`
already asserts Arabic-Indic quantities in its messages.

| File | Line (before) | What the user read |
| --- | --- | --- |
| `src/modules/custody/components/return-line-asset-selector.tsx` | 97, 145 | «الأصول المستردة للبند: 2 من 2» / «المحدد 1 من 2» |
| `src/modules/custody/components/return-line-asset-selector.tsx` | 192 | «وحدات العهدة التسلسلية المتاحة: 3» |
| `src/modules/issue/components/issue-line-asset-selector.tsx` | 59, 117 | «الأصول المحددة للبند: 1 من 2» |
| `src/modules/inventory-count/components/count-quantity-workspace.tsx` | 221 | the book-quantity column (Latin digits) |
| `src/modules/inventory-count/components/count-variance-review.tsx` | 55 | the book-quantity column (Latin digits) |
| `src/modules/inventory-count/components/count-variance-review.tsx` | 245, 250 | «(3 بند)» in the two blocking messages |
| `src/modules/inventory-count/pages/count-planning-form-page.tsx` | 376 | «المواد المحددة (2/100)» |
| `src/shared/documents/components/asset-line-editor.tsx` | 179, 408 | «الوحدة 1» / «بند الأصول 1» |
| `src/shared/documents/components/asset-line-editor.tsx` | 434 | the derived quantity |
| `src/shared/documents/components/quantity-line-editor.tsx` | 311 | «البند 1» |
| `src/shared/documents/document-header-form.tsx` | 228 | «الإصدار: 3» |
| `src/shared/documents/pages/document-detail-page.tsx` | 646 | «الإصدار: 3» |
| `src/shared/feedback/reference-limit-note.tsx` | 37 | «يعرض النظام أول 10 عنصراً من أصل 100» |
| `src/shared/layout/header/app-header.tsx` | 106 | the notifications badge and its `aria-label` |

Each of them now goes through `formatNumber` (a grouped quantity or a count)
or `toArabicDigits` (an ordinal, a version, a badge count).

### D3 — the same Latin digits reached the accessible names

The line editors label their rows and their controls in Arabic, and the digit
was part of that Arabic name:

| File | Line (before) | Accessible name |
| --- | --- | --- |
| `src/shared/documents/components/asset-line-editor.tsx` | 270 | `حذف الوحدة 1 من البند 1` |
| `src/shared/documents/components/asset-line-editor.tsx` | 469, 480 | `إضافة وحدة/أصل إلى البند 1`, `حذف البند 1` |
| `src/shared/documents/components/quantity-line-editor.tsx` | 229 | `وحدة البند 1` |
| `src/shared/documents/components/quantity-line-editor.tsx` | 486, 508, 555 | `تاريخ انتهاء البند 1`, `نوع الافتتاحية للبند 1`, `حذف البند 1` |

These are read aloud by a screen reader, so the digit is as user-visible as the
ink on the page. They are now Arabic-Indic too.

### D4 — `.ltr` is not a utility in this project

Two count cells carried `className="ltr"`
(`count-quantity-workspace.tsx:221`, `count-variance-review.tsx:55`), but
`src/index.css` declares no `.ltr` rule — `ltr` is a Tailwind **variant**
(`ltr:`), not a class, so the declaration did nothing and the cell rendered a
Latin-digit quantity inside an RTL table. The dead class was removed and the
quantity now renders through `formatNumber`.

### D5 — the notification badge and its label disagreed with the app

`src/shared/layout/header/app-header.tsx:106` rendered the unread-notification
count in Western digits while the badge's own `aria-label` (line 103) said
«3 إشعارات غير مقروءة». Both are Arabic-Indic now.

## The fixes

| File | Change | Why |
| --- | --- | --- |
| `src/modules/organization/pages/site-detail-page.tsx` | the two labels restored to «العنوان» and «معرّف الجهة المالكة» | D1 |
| `src/modules/custody/components/return-line-asset-selector.tsx` | 5 numbers through `formatNumber` | D2 |
| `src/modules/issue/components/issue-line-asset-selector.tsx` | 4 numbers through `formatNumber` | D2 |
| `src/modules/inventory-count/components/count-quantity-workspace.tsx` | the book quantity through `formatNumber`; the dead `className="ltr"` removed | D2, D4 |
| `src/modules/inventory-count/components/count-variance-review.tsx` | 3 numbers through `formatNumber`; the dead `className="ltr"` removed | D2, D4 |
| `src/modules/inventory-count/pages/count-planning-form-page.tsx` | the selected-materials counter and the 100-material limit through `toArabicDigits` (JSX label **and** the two Arabic messages that quote the limit) | D2 |
| `src/shared/documents/components/asset-line-editor.tsx` | 2 ordinals, 1 quantity and 4 accessible names through `formatNumber`/`toArabicDigits` | D2, D3 |
| `src/shared/documents/components/quantity-line-editor.tsx` | 1 ordinal and 5 accessible names through `toArabicDigits` | D2, D3 |
| `src/shared/documents/document-header-form.tsx` | the version badge through `toArabicDigits` | D2 |
| `src/shared/documents/pages/document-detail-page.tsx` | the version badge through `toArabicDigits` | D2 |
| `src/shared/feedback/reference-limit-note.tsx` | the two counts through `formatNumber` | D2 |
| `src/shared/layout/header/app-header.tsx` | the badge count and its `aria-label` through `toArabicDigits` | D2, D5 |
| `src/modules/catalog/components/material-form-dialog.tsx` | a `standard-allow:` marker on the English-name placeholder | the decision below |
| `src/modules/catalog/components/unit-of-measure-form-dialog.tsx` | a `standard-allow:` marker on the unit-type placeholder | the decision below |
| `src/modules/organization/components/organizational-unit-form-dialog.tsx` | a `standard-allow:` marker on the unit-name example | the decision below |
| `src/modules/warehouse/components/warehouse-form-dialog.tsx` | a `standard-allow:` marker on the warehouse-name example | the decision below |
| `src/shared/ui/calendar.tsx` | two `standard-allow:` markers | the date-surface decision below |
| `src/test/support/source-scan.ts` | `excusedLines` is now exported (it was private) | the new fence needs the excused line indexes, because `withoutAllowMarkers` shifts the line numbers a scan has to report |

No new component, no new dependency, no contract change, no backend change, and
no English copy was translated.

## The decisions

### The two debatable placeholders

**`material-form-dialog.tsx:248` — `placeholder="Desktop Computer"`.** KEPT.
The field is `nameAr`'s sibling `nameEn`, labelled «اسم المادة بالإنجليزية
(اختياري)» and rendered `dir="ltr"`; its value is the material's ENGLISH name,
so an English example is the correct content of the placeholder, and the
Arabic sibling field already uses «مثال: حاسوب مكتبي». A `standard-allow:
latin-attribute-example` marker records the reason in the source next to the
value.

**`unit-of-measure-form-dialog.tsx:132` — `placeholder="Quantity"`.** KEPT.
The field is `unitType`, and the wire contract declares it a **free-form string
the server defines** (`src/modules/catalog/schemas/unit-of-measure.schemas.ts`
and `src/modules/catalog/types/catalog.api-types.ts` both say so explicitly).
The placeholder shows the literal value the server expects — the same value
`UNIT_TYPE_LABELS_AR` maps to «الكمية» for display. Putting the Arabic word in
the placeholder would make the field offer a value the server does not use. A
`standard-allow: latin-attribute-example` marker records the reason.

### The header chip — a DATA-SOURCE question, not a copy question

Browser QA reported the header chip showing **"System Administrator"**. This is
**server data**, and the frontend must not translate it.

Measured: `src/shared/layout/app-layout.tsx:46` renders
`<AppHeader breadcrumb={…} userMenu={userMenu} />` — it does NOT pass the
`user` prop. The chip the user sees is therefore
`src/modules/auth/components/session-user-menu.tsx`, which renders
`toSessionUserDisplayName(session.user)`
(`src/modules/auth/services/session-display.ts:14-34`): that function joins
`session.user.firstName` and `session.user.lastName`, falling back to
`employeeName` and then to `email`. It is server text, verbatim.

So "System Administrator" is the **seeded administrator account's own name** as
the backend serves it. The question to raise with the backend owner is whether
the seeded admin's `firstName`/`lastName` should be the Arabic «مدير النظام»
(consistent with the role label below) or whether the seed is deliberately
English.

Two related facts, for whoever picks that up:

- The role's ARABIC label already exists and is not a translation problem:
  `docs/role-arabic-label-contract-decision.md` (D-RBAC-03) makes
  `UserSessionRoleDto.nameAr` a required field, with the seed
  `SYSTEM_ADMIN` → «مدير النظام», and
  `src/modules/auth/types/session.types.ts:41-47` declares `nameAr` as "the
  authoritative Arabic label and … what the UI must render".
- The scope label solved the same class of problem already:
  `toSessionScopeLabel` derives the Arabic label from the scope TYPE and uses
  the server's own `scopeName` only as the fallback, because the server sends
  the English word "Enterprise" for the enterprise scope.

The header does not render a role at all, so nothing in the frontend needs to
change for the chip; the `roleName` prop of `AppHeader`
(`src/shared/layout/header/app-header.tsx:11,125`) is a component-level
override that production does not use.

### The date surface keeps Gregorian Latin digits

`src/shared/ui/calendar.tsx` renders the month caption and the day cells. The
audit measured them as raw numeric interpolations, and they were the two sites
that could not simply be converted: the calendar shares its date convention
with `formatArabicDate` (`src/shared/ui/calendar-utils.ts:39`), which is what
`src/shared/ui/date-picker.tsx:84` uses for its own accessible name, and that
formatter renders «15 أغسطس 2026» in Latin digits.

Converting the calendar ALONE would have made the calendar and the date picker
that opens it disagree about the same date, so the two sites carry a
`standard-allow: raw-number-interpolation` marker instead, and the whole shared
date surface stays on one convention.

This leaves a real inconsistency, recorded rather than hidden: the shared date
surface uses Latin digits while `formatDate` in
`src/shared/utils/format.ts:56` renders «١٥ أغسطس ٢٠٢٦» in Arabic-Indic for
every other surface. That is a follow-up, not a defect this bead introduced.

## The fence

`src/test/rtl-copy-audit.test.ts` scans the pinned production set (**394**
files) and asserts:

| Rule | Detector | Negative control |
| --- | --- | --- |
| R1 — no raw numeric interpolation in JSX text | every `JsxExpression` that is a JSX CHILD is typed through the real compiler; an expression whose type is `number` is an offender unless the element or one of its ancestors carries `dir="ltr"` (or the shared `DetailField`'s `ltr` prop), or a `standard-allow: raw-number-interpolation` marker excuses it | a synthetic control file holds a number in Arabic prose (`{quantity}`), the same number through a house formatter (`{formatNumber(quantity)}`), and the same number in a left-to-right run (`<span dir="ltr">{quantity}</span>`): the detector reports **exactly one** offender, the prose one |
| R2 — no Latin text in a user-visible attribute | the value of each of the 16 user-visible attribute names is read; it is an offender unless every Latin token in it is a TECHNICAL EXAMPLE — an email address, a dotted login name, an uppercase code or acronym, a CamelCase identifier, a UUID, an ISO date, or a JSON object — or a `standard-allow: latin-attribute-example` marker excuses it | a synthetic control file holds `placeholder="Save the document"` (three English words → an offender), `placeholder="حفظ المستند"` and `placeholder="user@eiams.local"` (both clean): the detector reports **exactly one** offender, the English phrase |
| R3 — the Arabic font stack | `src/index.css` must declare `--font-sans` and `--font-arabic` with 'Traditional Arabic' then 'Noto Sans Arabic Variable', must import `@fontsource-variable/noto-sans-arabic`, and must apply `font-sans` to `html` | n/a (an assertion over a file, not a pattern) |
| R4 — the document is Arabic and right-to-left | `index.html` must declare `<html lang="ar" dir="rtl">`, and the app shell must carry `dir="rtl"` | n/a |

**The physical-direction rule is deliberately NOT re-implemented here.**
`src/test/responsive-audit.test.ts` already owns it as its R5, over the same
394-file set; a second copy of the same rule is duplicated infrastructure that
drifts. This file asserts that the owning fence is still there and still pins
the same file count, so the delegation cannot become a dead reference.

**The design-token rule is likewise not duplicated.** `src/test/design-token-
literals.test.ts` owns colour, spacing, radius and shadow literals. This audit
checks digits and copy only.

### The allowlists

| Rule | Allowlist | Pinned at |
| --- | --- | --- |
| `latin-attribute-example` | 4 markers | 4 |
| `raw-number-interpolation` | 2 markers (the calendar) | 2 |

The four `latin-attribute-example` markers are the values that are an English
PHRASE rather than a technical token shape: «Desktop Computer», «Quantity»,
«مثال: Department» and «مثال: Storage». Every other technical example in the
tree is recognised by its SHAPE, which is why the exception set did not grow to
twenty-four: the repo-wide guard in
`src/test/error-feedback-de-duplication-standard-scans.test.ts:126` caps ALL
`standard-allow:` markers at **10**, and the whole repository now holds **7**
(touch-target-floor 1, latin-attribute-example 4, raw-number-interpolation 2).

### The fence can fail

The detectors were proved against DELIBERATE violations of the production tree,
not against a comment. Two violations were applied, the fence was run, and the
tree was restored:

| Violation applied | Detector that fired | Message |
| --- | --- | --- |
| `{formatNumber(unitItems.length)}` put back to `{unitItems.length}` in `src/modules/custody/components/return-line-asset-selector.tsx` | R1 | `src/modules/custody/components/return-line-asset-selector.tsx:194: {unitItems.length}` |
| `placeholder="DAM-HQ"` put back to `placeholder="Enter the site code"` in `src/modules/organization/components/site-form-dialog.tsx` | R2 | `src/modules/organization/components/site-form-dialog.tsx:225: placeholder="Enter the site code"` |

The run above was made against the 2026-10-30 draft of this fence. The
fence as implemented on 2026-11-02 has **10 tests** and proves itself
with a synthetic control file (`src/test/fixtures/rtl-copy-audit-control.tsx`)
instead: every pattern detector must report exactly one offender there, and
one clean control per detector must report none.

## What the implementation changed (2026-11-02)

The fence was written on 2026-11-02; this section records what the implementation
differs from the 2026-10-30 description above.

- **The file-set measurements are refreshed**: 415 application source files, 21
  gallery files, 394 scanned production files. The three anti-drift owners
  (esponsive-audit, query-render-profile-audit, ccessibility-audit) pin
  the same numbers.
- **One rule beyond R1-R4**: raw ASCII digits written literally in JSX text are
  reported as well. R1 as described above covers *interpolation* only, and a
  literal digit in prose is the same defect.
- **The negative control is a real file**: src/test/fixtures/rtl-copy-audit-control.tsx
  lives under src/test/, so it is outside the scanned set while still being
  part of the TypeScript program.
- **The implementation forced two production fixes**, both digit conversions
  to Arabic-Indic in Arabic prose: src/modules/adjustment/pages/asset-disposal-form-page.tsx:298
  and src/modules/custody/components/return-line-asset-selector.tsx:238, plus
  the matching expectation in eturn-line-asset-selector.test.tsx:342.
## What this audit does NOT cover

### The rules it delegates

- **Physical-direction CSS.** Owned by `src/test/responsive-audit.test.ts` (R5).
  Measured at **0** offenders here; not re-implemented.
- **Design tokens** (colour, spacing, radius, shadow, animation). Owned by
  `src/test/design-token-literals.test.ts`. This audit is about digits and
  copy.
- **Contrast, focus rings, hit targets, and screen-reader semantics.** Those
  belong to `docs/accessibility-audit.md`,
  `docs/keyboard-screen-reader-audit.md` and `docs/responsive-audit.md`.

### Coverage gaps, with their reasons

- **(a) Arabic copy in ATTRIBUTE values is not covered by R1.** R1 reads JSX
  TEXT — a child expression. A number interpolated into an attribute (an
  `aria-label` template, a `title`) is a different surface and is not this
  rule's business. The audit FIXED the eight such sites it found (D3) by hand,
  but the fence does not prevent a new one. Closing the gap means widening R1
  to attributes, which is a larger rule with its own false-positive surface.
- **(b) The R2 attribute list is a closed list of 16 names.** An attribute that
  a component invents and renders as text (`errorText`, `hint`, `caption`) is
  not read by R2. The list is the house's set of "text a user reads"; widening
  it is a judgement call per attribute.
- **(c) A lone English WORD in a user-visible attribute is not caught.** R2
  recognises a technical example by shape, and a single capitalised word
  («Search») is not one of the shapes, so it IS reported — but the four
  reviewed exceptions show that a lone capitalised word can be legitimate.
  The rule therefore errs towards reporting, and the marker is the escape.
- **(d) The R1 rule is about the static type.** A value typed `any` (an
  untyped prop, an untyped API response) is not `NumberLike` and is not
  reported. The repository is `strict` with `noImplicitAny`, so this is rare,
  but it is a real gap.
- **(e) The shared date surface was NOT converted.** See the decision above:
  the calendar and the date picker keep Gregorian Latin digits, while
  `formatDate` renders Arabic-Indic everywhere else. The inconsistency is
  recorded, not resolved.
- **(f) Backend error copy.** `docs/error-copy-ar-backlog.md` (269 uncovered
  backend error codes) belongs to bead `z1hs` and to a HUMAN Arabic content
  owner. Nothing here machine-translates a backend code.
- **(g) The dev-only gallery.** `src/app/gallery/**` is excluded from the
  scan, as it is from the responsive audit.

### Not covered at all

- **The rendered result.** Every measurement here is a SOURCE measurement. No
  browser was driven for this audit; the visual result of Arabic-Indic digits
  in a table cell, a badge or a calendar was not photographed.
- **Reading order and mirroring.** `dir="rtl"` and the logical properties are
  asserted, not measured in a viewport.
- **The fonts themselves.** R3 asserts that the stack is DECLARED and
  APPLIED. It does not assert that 'Traditional Arabic' is installed on the
  machine: it is a Windows system face, so on other platforms the chain falls
  through to the bundled 'Noto Sans Arabic Variable'. That fallback is by
  design, and nothing in this audit measures which face actually rendered.
- **Server data.** The header chip's English text is reported as a data-source
  question (above), not translated.

## Revert-proofs

- Putting `{unitItems.length}` back in
  `src/modules/custody/components/return-line-asset-selector.tsx` makes
  `src/test/rtl-copy-audit.test.ts` fail on "renders every number the user
  reads through the Arabic formatters".
- Putting `placeholder="Enter the site code"` back in
  `src/modules/organization/components/site-form-dialog.tsx` makes it fail on
  "keeps Latin text out of the user-visible attributes".
- Restoring the mojibake in
  `src/modules/organization/pages/site-detail-page.tsx` makes it fail on the
  same rule, because "OٕU,O1U+U^OٕO+" is not a technical example.
- Removing `--font-sans` from `src/index.css`, or the `html { @apply
  font-sans }` rule, makes it fail on "declares the Arabic font stack" / "applies
  the Arabic chain to the document".
- Adding a fifth `latin-attribute-example` marker makes it fail on "keeps the
  Latin-attribute exception set small".
- Each detector additionally carries a synthetic negative control, so a rule
  that can never fire is caught by the audit itself.
