# Responsive workflow audit

**Status:** Enforced by a source scan and by measured browser checks
**Bead:** `eiams-frontend-e25-t04`
**Date:** 2026-10-30
**Mechanism:** `src/test/responsive-audit.test.ts` (a source scan over the pinned production file set) plus CDP device-metrics measurements of the live dev server

## How the measurements were taken

Every number below is a **measurement**, not an opinion. Two independent
instruments were used.

### 1. A real browser at a real viewport

The chrome-devtools MCP `emulate` action applies a CDP
`Emulation.setDeviceMetricsOverride`, which gives a genuine layout viewport of
the requested width:

| Viewport argument | `window.innerWidth` | `documentElement.clientWidth` |
| --- | --- | --- |
| `360x780x1,mobile,touch` | 360 | 360 |
| `768x1024x1,touch` | 768 | **753** |
| `1280x900x1` | 1280 | **1265** |

The narrow-viewport limit usually quoted for this MCP (≈501px) belongs to
`resize_page`, which resizes the real OS window; `emulate` does not have that
limit. The layout width is 15px smaller than the emulated width at 768 and
1280 because the classic scrollbar is inside the emulated window.

### 2. One stated probe

Every "controls under 40px" number in this document comes from this probe, so
it can be reproduced:

```js
const SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], ' +
  '[role="switch"], [role="radio"], [role="menuitem"], [role="tab"]'
// An element is a CONTROL when it matches SELECTOR and its
// getBoundingClientRect() has a non-zero width and height, and its computed
// visibility is not 'hidden' and its computed display is not 'none'.
// A CONTROL is UNDER 40px when Math.round(rect.height) < 40.
```

A second, different count exists — "visible controls" — which is why the
independent review measured 20 where this probe measures 47 on the list page:
the other probe counted only what a user can see and included the 16px drawn
checkbox span, this one counts every focusable element including the
visually hidden native inputs and the skip link. **Both numbers are given
below; this document uses the probe above and says so.**

The dev server (`http://localhost:5173`) was reached on the host `localhost`,
which resolves to the Vite proxy in front of the live backend on
`127.0.0.1:5000`. The session used was the seeded `admin` account — the only
role that exists, and it holds no `document.*`, `audit.*`, `inventory.*` or
`report.*` permission (see "what this audit does not cover").

## The measurement

`scrollW` is `document.documentElement.scrollWidth` and `clientW` is
`document.documentElement.clientWidth`: the root element's content width and
its visible width. `scrollW === clientW` means the PAGE does not scroll
sideways.

| Surface | Metric | 360×780 | 768×1024 | 1280×900 |
| --- | --- | --- | --- | --- |
| `/login` | scrollW / clientW | 360 / 360 | 768 / 768 | 1265 / 1265 |
| | controls under 40px | **0** of 3 | 0 of 3 | 0 of 3 |
| `/` (dashboard) | scrollW / clientW | 360 / 360 | 753 / 753 | 1265 / 1265 |
| | sidebar width / main width | 0 (off-canvas) / 360 | 64 (icon rail) / 689 | 260 (full rail) / 1005 |
| | controls under 40px | 1 of 5 | 3 of 21 | 3 of 21 |
| | the header brand link | 98.3 × 40 | 98.3 × 40 | 98.3 × 40 |
| `/catalog/materials` (list) | scrollW / clientW | 360 / 360 | 753 / 753 | 1265 / 1265 |
| | table width → scroller width | 997 → 277 | 973 → 590 | 973 → 890 |
| | controls under 40px | **5** of 47 | 40 of 63 | 44 of 67 |
| | the material-name cell link | 65 × 40 | 65 × 20 | 65 × 20 |
| `/catalog/materials/:id` (detail) | scrollW / clientW | 360 / 360 | 753 / 753 | 1265 / 1265 |
| | controls under 40px | 1 of 10 | 3 of 26 | 8 of 31 |
| material form dialog | panel width, x-range | 324, 18→342 | 640, 56→696 | 640, 312→952 |
| | page scrollW while open | 360 | 753 | 1265 |
| | button heights in the panel | 40×7 | 40×6, 32×1 (close) | 40×6, 32×1 (close) |
| | input heights in the panel | 40×3, 64×1 (textarea) | 40×3, 64×1 | 40×3, 64×1 |
| | children wider than the panel | 0 | 0 | 0 |
| confirm / alert dialog | panel width, x-range | 324, 18→342 | — | — |
| | page scrollW while open | 360 | — | — |
| | button heights in the panel | 40×2 | — | — |
| off-canvas drawer @360 | drawer box | 260 wide, x 100→360 | — | — |

### The five controls still under 40px on the list page at 360px

| Control | Measured | Why it is not a defect |
| --- | --- | --- |
| the skip link («تخطَّ إلى المحتوى») | 1×1 | visually hidden until focused (`sr-only`) |
| 4 native checkbox inputs | 1×1 | the visually hidden input behind a drawn control |
| — | — | **no button-like control is under 40px at 360px** |

At 768 and 1280 the compact control sizes are back to their ui-design.md 5.1
values (32/36px) and the table-cell links are back to 20px, which is why the
count rises to 40 of 63 and 44 of 67.

### The hover inventory

| Measurement | Value |
| --- | --- |
| production files containing a `hover:` token | **39** |
| `hover:` tokens in production | **60** |
| of which on an interactive element with NO `focus-visible:` twin | **2** (both fixed, see D3) |

## The defects found

### D1 — the button-like controls were shorter than the 40px touch floor on a phone

Measured before the change:

| Control | Measured | Where |
| --- | --- | --- |
| header menu / notification bell | 36×36 | `src/shared/layout/header/app-header.tsx` |
| the header brand link | 98.3 × 32 | `src/shared/layout/header/app-header.tsx` |
| table row actions (edit / disable / archive) | 32×32 | `size="icon-sm"` |
| pagination "previous" / "next" | 32 / 32 | `size="sm"` |
| page-size select trigger | 36 | `SelectTrigger size="sm"` |
| shared table sort control | 23 | `src/shared/ui/data-table.tsx` |
| toast close | 28 | `src/shared/ui/toast.tsx` |
| file-dropzone remove | 32 | `src/shared/feedback/file-dropzone.tsx` |
| date-picker clear | 24 | `src/shared/ui/date-picker.tsx` |
| shared checkbox | 16 drawn, **38.67** hit | `src/shared/ui/checkbox.tsx` |
| reports tab | ≈35 (computed: `px-4 py-2 text-sm` → 8 + 8 + 18.6px) | `src/modules/reports/components/reports-tabs.tsx` |
| shared select option | 142.7 × 37 | `src/shared/ui/select.tsx` |
| shared dropdown-menu option | ≈34.6 (computed: `py-2 text-sm` → 8 + 18.6 + 8) | `src/shared/ui/dropdown-menu.tsx` |
| print trigger | 36 | `size="icon"` in `src/shared/ui/print-button.tsx` |

After the change the list page at 360px reports **5 controls under 40px, none
of them button-like** (the table above), and the dialog reports every button
at 40px.

### D2 — the table-cell links were 20px tall

Every table-cell link in the app is rendered through the shared `DataTable`
(15 of the 16 sites below) or through one raw table
(`src/shared/documents/pages/document-detail-page.tsx`). A cell link is an
inline box: **65 × 20** on the materials list, on every row, on every page
that has a link column — below the 40px floor and below WCAG 2.5.8's 24×24.

The sites, all of which now inherit the shared fix:

| # | File | Site |
| --- | --- | --- |
| 1 | `src/modules/adjustment/pages/adjustments-list-page.tsx` | the adjustment-number link in the shared table |
| 2 | `src/modules/admin/pages/roles-catalog-page.tsx` | the role-name link in the shared table |
| 3 | `src/modules/asset/pages/asset-custody-history-page.tsx` | the asset link in the shared table |
| 4 | `src/modules/asset/pages/asset-registry-list-page.tsx` | the asset link in the shared table |
| 5 | `src/modules/audit/pages/audit-log-explorer-page.tsx` | the audit-link cell in the shared table |
| 6 | `src/modules/catalog/pages/materials-list-page.tsx` | the material-name link in the shared table |
| 7 | `src/modules/custody/pages/active-custody-list-page.tsx` | the asset link in the shared table |
| 8 | `src/modules/custody/pages/pending-custody-list-page.tsx` | the asset link in the shared table |
| 9 | `src/modules/inventory/pages/inventory-balances-page.tsx` | the material link in the shared table |
| 10 | `src/modules/inventory/pages/stock-movements-page.tsx` | the movement link in the shared table |
| 11 | `src/modules/inventory-count/pages/inventory-count-list-page.tsx` | the count link in the shared table |
| 12 | `src/modules/reports/components/recent-activity-panel.tsx` | the document link in the shared table |
| 13 | `src/modules/reports/components/stock-movement-report-table.tsx` | the movement link in the shared table |
| 14 | `src/modules/warehouse/pages/warehouses-list-page.tsx` | the warehouse link in the shared table |
| 15 | `src/shared/documents/pages/document-list-page.tsx` | the document-number link in the shared table |
| 16 | `src/shared/documents/pages/document-detail-page.tsx` | the asset link in the document lines table (a RAW table) |

### D3 — two hover-only affordances

| File | Affordance | Was | Now |
| --- | --- | --- | --- |
| `src/modules/inventory-count/pages/count-planning-form-page.tsx` | the ✕ that removes a material from the count line | `hover:text-destructive`, no focus state | `+ focus-visible:text-destructive focus-visible:ring-2 focus-visible:ring-ring` |
| `src/modules/admin/pages/roles-catalog-page.tsx` | the role-name link | `hover:text-primary hover:underline`, no focus state | `+ focus-visible:text-primary focus-visible:underline` |

The other 58 `hover:` tokens in the 39 production files are **not**
hover-only: every one of them is either on an always-visible control that
already carries a `focus-visible:` state in the same class expression, or on
a decorative element (a table row, a card, a tree row, a badge).

### D4 — one physical direction utility, and the trap in replacing it

`src/shared/layout/sidebar/sidebar.tsx` positioned the off-canvas drawer with
`max-md:right-0`. The drawer belongs on the **inline-start** side, which in
this RTL-only application is the right edge.

The naive logical translation is wrong, and the audit found it by measuring
rather than by reading: with `max-md:end-0` the drawer measured at
**x 0→260** (the inline END is the LEFT in RTL) instead of the correct
**x 100→360**. The correct spelling is `max-md:start-0`, which measures at
**x 100→360**, `inset-inline-start: 0` → `right: 0px` — identical to the old
physical rule, but correct in the document's own direction.

### D5 — three horizontal scroll containers could not shrink

`overflow-x-auto` without `min-w-0` keeps the content's min-content width as
its automatic minimum size, so inside a flex or grid parent the container
pushes the parent wide instead of scrolling.

| File | Container | Was | Now |
| --- | --- | --- | --- |
| `src/shared/documents/pages/document-detail-page.tsx` | document lines table (`min-w-130` = 520px) | `overflow-x-auto` | `min-w-0 overflow-x-auto` |
| `src/modules/adjustment/pages/adjustment-detail-page.tsx` | adjustment lines table (`min-w-130`) | `overflow-x-auto` | `min-w-0 overflow-x-auto` |
| `src/modules/warehouse/components/warehouse-capabilities-overview.tsx` | capabilities table (`min-w-[34rem]` = 544px) | `overflow-x-auto` | `min-w-0 overflow-x-auto` |

### D6 — the shared `ContentCard` could not shrink

`src/shared/layout/content-card.tsx` is `flex flex-col` with no `min-w-0`. It
is the parent of every wide table on every page, so it now carries `min-w-0`
like the rest of the chain. No production surface was measured to overflow
because of it; it is the same class of defect as D5 and the fence pins it.

### D7 — the checkbox hit area is 38.67px, not 40px

**This is the documented truth, not a round number.** The shared `Checkbox`
draws a 16×16px box; the invisible `after:` pseudo-element is what a finger
hits, and it is sized against the PADDING box (14.67px), not the border box:

```
getComputedStyle(checkbox, '::after').width  →  "38.6667px"   (measured)
```

`after:-inset-3` (the 12px spacing token) therefore reaches **38.67 ×
38.67px**, not 40×40. Reaching a true 40px would need a **12.67px** inset:
the Tailwind spacing scale steps by 0.25rem, so there is no token for it
(`inset-3` = 12px, `inset-4` = 16px), and the 16px token would push the hit
area over the neighbouring content. Measured in the material dialog, the
pseudo-element's left edge already sits **0.67px** from the adjacent label's
right edge (the independent review measured a 4.67px clearance in the
role-permission matrix and 4.97px from the adjacent cell in the gallery's
`DataTable` demo). A 16px inset would overlap the label, and a label click
that lands on the pseudo-element toggles the checkbox twice — the control
would appear not to respond.

**Decision: keep the 12px token and document 38.67px.** 38.67px is above
WCAG 2.5.8's 24×24 minimum and 1.33px short of the house 40px floor; the
alternative trades a working label for a round number.

### D8 — the documentation and the test fixtures were shipping as dead CSS

Tailwind v4 auto-detects every source file in the repository, so the class
names written in `docs/` and in `src/test/` were compiled into the production
stylesheet as rules no component uses. Before the fix, `dist/assets/index-*.css`
carried `.ml-2`, `.w-[420px]`, `.min-w-[600px]`, `.text-left`,
`.after:-inset-x-3` and `.max-md:right-0`.

Fix: `src/index.css` now declares

```css
@source not '../docs';
@source not '../src/test';
```

After a fresh production build:

| Rule | Before | After | Live consumer that keeps it |
| --- | --- | --- | --- |
| `.ml-2` | present | **gone** | — |
| `.w-[420px]` | present | **gone** | — |
| `.min-w-[600px]` | present | **gone** | — |
| `.max-md:right-0` | present | **gone** | — |
| `.text-left` | present | present | `src/app/gallery/demos/selector-adapters-demo.tsx:142` |
| `.after:-inset-x-3` | present | present | `src/shared/ui/switch.tsx:16`, `src/shared/ui/radio-group.tsx:25` |

The two rules that remain are **not** dead: `.text-left` is used by the
dev-only gallery's selector-adapters demo and `.after:-inset-x-3` by the
shared switch and radio group. Excluding the gallery from the content
detection as well would remove `.text-left` from the production stylesheet,
but it would also strip EVERY utility the dev-only gallery uses and leave
that QA surface unstyled, so the gallery stays in the scan.

## The fixes

| File | Change | Why |
| --- | --- | --- |
| `src/index.css` | `@source not '../docs'` and `@source not '../src/test'` | D8 |
| `src/shared/ui/button.tsx` | `xs`/`sm`/`icon-sm`/`icon-xs` declare a 40px height below the `sm` breakpoint and keep their ui-design.md 5.1 size from `sm` up | D1 — one file lifts ~35 call sites (table row actions, pagination, calendar navigation, tree actions, dialog close) |
| `src/shared/ui/checkbox.tsx` | the invisible `after:` hit area is `-inset-3`; the comment states the measured 38.67px | D7 |
| `src/shared/ui/select.tsx` | the small trigger declares `h-10` below `sm`; a select option declares `min-h-10` | D1, D1 (options) |
| `src/shared/ui/dropdown-menu.tsx` | a menu option declares `min-h-10` | D1 (options) |
| `src/shared/ui/date-picker.tsx` | the clear button is `h-10 w-6` instead of `size-6` | D1 |
| `src/shared/ui/data-table.tsx` | the column sort control declares `min-h-10`; the table declares `max-sm:[&_a]:inline-flex max-sm:[&_a]:items-center max-sm:[&_a]:min-h-10` | D1, D2 |
| `src/shared/documents/pages/document-detail-page.tsx` | the document lines table declares the same cell-link rule | D2 (the one raw table) |
| `src/shared/layout/header/app-header.tsx` | the three icon buttons are `size-10 sm:size-9`; the brand link is `min-h-10` | D1 |
| `src/shared/feedback/file-dropzone.tsx` | the remove button is `size-10 sm:size-8` | D1 |
| `src/shared/ui/toast.tsx` | the close button is `size-10 sm:size-7` | D1 |
| `src/shared/ui/print-button.tsx` | the trigger declares `min-h-10 min-w-10 sm:min-h-9 sm:min-w-9` | D1 — the `icon` size itself is untouched |
| `src/modules/reports/components/reports-tabs.tsx` | the tabs declare `min-h-10` | D1 |
| `src/shared/layout/content-card.tsx` | the card declares `min-w-0` | D6 |
| `src/shared/documents/pages/document-detail-page.tsx`, `src/modules/adjustment/pages/adjustment-detail-page.tsx`, `src/modules/warehouse/components/warehouse-capabilities-overview.tsx` | the scroll containers declare `min-w-0` | D5 |
| `src/modules/inventory-count/pages/count-planning-form-page.tsx`, `src/modules/admin/pages/roles-catalog-page.tsx` | the hover affordances gained their `focus-visible:` twin | D3 |
| `src/shared/layout/sidebar/sidebar.tsx` | `max-md:right-0` → `max-md:start-0` | D4 |

Nothing was added: no new component, no new dependency, no new module, no
route, and no Arabic copy was rewritten.

## The fence

`src/test/responsive-audit.test.ts` scans the pinned production set (**388**
files; `src/test/**`, `src/contract-smoke/**` and `src/app/gallery/**`
excluded) and asserts:

| Rule | Detector | Negative control |
| --- | --- | --- |
| R1 — no fixed pixel width outside the sidebar | every class expression is scanned for `w-[Npx]` / `min-w-[Npx]` / `max-w-[Npx]`; the sidebar's own `260px` is the only allowance | `className="w-[420px]"` and `className="min-w-[600px]"` are both caught; the sidebar's `w-[260px] md:w-16 lg:w-[260px]` is not; a rem-based `min-w-[34rem]` is not (it is a scroll floor, not a fixed pixel width) |
| R2 — every horizontal scroll container may shrink | the class expression carrying `overflow-x-auto`/`overflow-x-scroll` must also carry `min-w-0` | `<div className="overflow-x-auto">` is caught; `<div className="min-w-0 overflow-x-auto">` is not; `<div className="overflow-x-hidden">` is not a scroll container and is not flagged |
| R3 — no hover-only affordance | the class EXPRESSION of every native interactive element (`button`, `a`, `input`, `select`, `textarea`) and of `Link`/`NavLink` is collected; a `hover:` token without a `focus-visible:` token in the same expression is an offender. `buttonVariants(` is exempt because the shared Button's base carries the focus ring | `<button className="… hover:text-destructive">` is caught; adding `focus-visible:text-destructive` clears it; a `cn("hover:bg-muted", "focus-visible:ring-2")` composition clears it; `<tr className="hover:bg-ivory">` is not an interactive element and is not flagged |
| R4 — the shared touch primitives reach 40px | **(a)** every entry of the shared `Button`'s size map must declare a mobile height ≥ `h-10`/`size-10`; **(b)** 19 ELEMENT rules, each naming one element by an anchor in its opening tag (`data-slot`, `aria-label`, `size="icon"`, …) and the class tokens THAT element must carry: the `Input`, the `Textarea`, the `Select` trigger (both sizes), a `Select` option, a `DropdownMenu` option, the `DatePicker` trigger and its clear control, the `Checkbox` hit area, the `DataTable` sort control, the `DataTable` cell links, the document lines table cell links, the dropzone remove control, the toast close, the header's three icon buttons, the header brand link, the print trigger, a reports tab | **(a)** a synthetic size map with `sm: 'h-8 gap-1.5 px-3'` is reported as `size "sm" reaches 32px on mobile`, and the floored form `h-10 … sm:h-8` is accepted; **(b)** EVERY element rule has its own synthetic control: the element keeps its anchor but loses the required class, and the rule fires; the sibling rules of the same file stay satisfied, so the failure is attributable to the rule under test. The forbidden class is caught too (`after:-inset-x-3 after:-inset-y-2` on the checkbox), and a rule whose element is missing entirely is an offender, not a pass |
| R5 — RTL logical properties only | every class expression is scanned for `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right` | `className="ml-2 flex"`, `className="right-0 top-0"` and `className="text-left"` are each caught; `ms-2` and `end-0` are not |

The one reviewed exception is declared in the SOURCE next to the code it
excuses, with the house marker:

```
// standard-allow: touch-target-floor — this 36px icon size is the shared CALENDAR's day cell (src/shared/ui/calendar.tsx). Measured: 7 columns x 36px = 252px, plus the date popover's 10px padding on each side = a 272px popover, which fits the 360px viewport with 88px to spare; a 40px cell would make it 300px, wider than the 280px date field the popover opens from.
icon: 'size-9',
```

`assertAllowlistIsSmall` keeps that set at one entry, so a second exception
fails the fence. The marker's reason names ONLY the calendar day cell: the
print trigger still uses the `icon` size, but it no longer RELIES on that
size's floor — it reaches 40px through `min-h-10 min-w-10`, which beat the
size's own width/height whatever the cascade order is.

### The fence can fail

The detectors were proved against DELIBERATE violations of the production
tree, not against a comment. The violations below were applied, the fence was
run, and the tree was restored:

| Violation applied | Detector that fired | Message |
| --- | --- | --- |
| `icon-sm` back to `size-8` | R4(a) | `src/shared/ui/button.tsx: size "icon-sm" reaches 32px on mobile` |
| `min-w-0` removed from the document-lines scroll container | R2 | `src/shared/documents/pages/document-detail-page.tsx: overflow-x-auto rounded-lg border border-border` |
| the focus state removed from the count-line chip's ✕ | R3 | `src/modules/inventory-count/pages/count-planning-form-page.tsx: button: hover:text-destructive` |
| the drawer put back on `max-md:right-0` | R5 | `src/shared/layout/sidebar/sidebar.tsx: max-md:right-0` |
| the header brand link's `min-h-10` removed | R4(b) | `src/shared/layout/header/app-header.tsx: the header's brand link is missing ^min-h-10$` |
| the shared table's cell-link rule removed | R4(b) | `src/shared/ui/data-table.tsx: a table-cell link in the shared table is missing ^max-sm:\[&_a\]:min-h-10$` |

With the violations in place the file reported **5 failed | 9 passed** (14
tests); with the tree restored it reports **14 passed**.

## What this audit does not cover

### The dev-only gallery still scrolls sideways

`/dev/gallery` measures `scrollWidth 619` against `clientWidth 360` at
360px. The offenders, per section (section content width 296px):

| Gallery section | scrollWidth | Offender |
| --- | --- | --- |
| `document-detail` | 587 | the `DocumentDetailBody` demo — the shared document lines table (`min-w-130` = 520px) |
| `asset-line-editor` | 520 | the demo's own `<pre class="max-h-44 overflow-auto …">`, whose `white-space: pre` makes its min-content width 503px |
| `document-header-section` | 309 | the demo's own header markup |

The cause is the gallery's OWN demo wrapper, not the shared components it
renders: a DOM-only experiment (no source change) that gives the gallery's
grid items `min-width: 0` takes the page from **619 → 360** with every shared
component untouched. `src/app/gallery/**` is out of scope for this bead, so
the gallery is **not** fixed here — this paragraph is the actionable record
for the follow-up.

### Coverage gaps, with their reasons

- **(a) The calendar popover could not be measured live.** Every `DatePicker`
  use sits on a page the seeded `admin` role cannot reach: `audit-log-explorer-page`
  (`audit.view`), `stock-movements-page` (`inventory.view`),
  `opening-document-form-page` and the shared `quantity-line-editor` (the
  document forms), and the report tables (`report.view`). The evidence that the
  role lacks them is direct: `/documents/receiving` answers «ليست لديك صلاحية
  الوصول», and the sidebar renders no document, audit, inventory or report
  entry. The calendar's geometry is therefore derived from the shared classes
  (7 columns × 36px = 252px + 2 × 10px popover padding = **272px**, against a
  360px viewport with 88px to spare), and the exception is declared in the
  source with that measurement.
- **(b) The print button is only rendered on report tables** —
  `asset-report-table`, `count-adjustment-report-table`,
  `inventory-balance-report-table`, `operational-documents-report-table` and
  `stock-movement-report-table` — all behind `report.view`, which the seeded
  role does not hold. Its 40px mobile height is therefore asserted by the
  fence on the ELEMENT's class tokens (`min-h-10 min-w-10`), not by a browser
  measurement.
- **(c) No production page enables `DataTable` row selection.** The
  `selection` prop appears only in the dev gallery's demo and in a unit test,
  so the "row-select checkbox next to a cell link" combination cannot be
  exercised on a reachable page. The shared `DataTable`'s own row-select
  checkbox was measured in the gallery demo with a **4.97px** clearance from
  the adjacent cell — the number that decides the checkbox's hit area (D7).

### Not covered at all

- **Every pixel width between 360 and 430.** The audit measures 360px, 768px
  and 1280px. The compact control sizes are restored at the `sm` breakpoint
  (640px), which was not measured edge by edge.
- **Real-device touch behaviour.** The numbers are layout boxes measured in
  Chrome. A real finger, a real stylus, long-press, double-tap zoom and the
  iOS safe-area insets were not exercised.
- **Vertical behaviour.** Vertical scroll, sticky header/table-header
  behaviour, long Arabic wrapping, browser font-size scaling and orientation
  changes were not measured.
- **Other surfaces.** Dark mode, print, the PDF report exports, the charts,
  and the RTL/LTR flip were not measured. The application is RTL-only, so the
  logical-property change in D4 is verified in RTL only — an LTR build would
  place the drawer on the left, which is the correct inline-start there but
  was never exercised.
- **Contrast and focus rings.** Those belong to
  `docs/accessibility-audit.md` and `docs/keyboard-screen-reader-audit.md`.

## Revert-proofs

- Removing `min-w-0` from the shared `Button`'s compact sizes makes
  `src/test/responsive-audit.test.ts` fail on "gives the shared touch
  primitives a 40px mobile floor".
- Removing `min-w-0` from a scroll container makes it fail on "lets every
  horizontal scroll container shrink".
- Removing a `focus-visible:` twin makes it fail on "gives every hover
  affordance a keyboard equivalent".
- Restoring a physical `right-0` makes it fail on "uses RTL logical
  properties only".
- Removing the `min-h-10` from the header brand link, or the cell-link rule
  from the shared table, makes it fail on the element rule that names it.
- Each detector additionally carries a synthetic negative control, so a rule
  that can never fire is caught by the audit itself.
