# Keyboard and screen-reader workflow audit

**Status:** Complete - two defects found and fixed
**Bead:** `eiams-frontend-e25-t02`
**Date:** 2026-10-29
**Scope:** the EIAMS frontend SPA, production source only (407 files)

## What was audited, and how

There is no accessibility engine in this repository - `axe-core`, `jest-axe`,
`@axe-core/react`, `vitest-axe` and `pa11y` are all absent from
`node_modules` and from the lockfile - so the audit is built on what the
repository already has: Testing Library's role-based queries, which assert an
accessible name by construction, and a source scan over the production tree.

The census was measured over the 407 production files:

| Measured | Count |
| --- | --- |
| `aria-hidden` | 172 |
| `aria-label` | 206 |
| `aria-live` | 21 |
| `role=` | 134 |
| `focus-visible:` | 143 |
| `sr-only` | 6 |
| `outline-none` | 37 |
| `tabIndex` | 4 (none positive) |
| `autoFocus` | 0 |
| `focus(` | 0 |
| `onKeyDown` | 7 |

## The two defects

### 1 - no skip-to-content link (WCAG 2.4.1, Bypass Blocks, Level A)

The shell renders the whole navigation `<Sidebar>` BEFORE `<main>`, so a
keyboard user had to tab through every navigation link on every page load to
reach the page content. No skip link existed anywhere in the tree - a search
for `skip` matched only comments ("skips devOnly routes", "skips it").

**Fixed.** `src/shared/layout/app-layout.tsx` now renders a visually-hidden
skip link as the FIRST focusable element of the shell, targeting the main
region by id. The link becomes visible on focus, using the house focus ring.

### 2 - the app never moved focus and never announced a route change (WCAG 2.4.3 focus order, 4.1.3 status messages)

`focus(` appears ZERO times across the 407 production files, and nothing in
the router observes the location. After a client-side navigation the focus
stayed on the activated sidebar link, and the screen reader was never told the
page had changed. All 21 `aria-live` regions announce a LOCAL status (a field,
a panel, a KPI, a loading spinner) - none of them announces the route, and
none of the 6 `sr-only` usages is a skip link.

**Fixed.** A new `src/shared/layout/route-focus-announcer.tsx` provides:
`APP_MAIN_ID`, a pure `matchRouteKey(pathname)` that resolves a pathname to the
route key that owns it (the most literal segment wins, so `/assets/42` resolves
to the asset DETAIL route, not the list), and `RouteFocusAnnouncer`, which on a
pathname CHANGE moves focus to the main region and announces the new route's
Arabic label from `ROUTE_METADATA` in a polite live region. `<main>` now
carries `id={APP_MAIN_ID}` and `tabIndex={-1}` so it can receive focus.

## What the audit verified as already correct

- **Landmarks.** A named `<main>`, a named `<nav>` in the sidebar, a second
  named `<nav>` in the breadcrumbs, a `<header>`, an `<aside>` and a
  `<footer>` - all present and all labelled.
- **Overlays.** `aria-modal` and `role="dialog"` appear ZERO times, because
  the dialog, alert dialog, popover, dropdown and select overlays delegate
  their semantics, focus trap and Escape handling to the shared Base UI
  primitives. That is the correct arrangement, and it is why the eight
  `outline-none` hits that carry no focus replacement are NOT defects: they
  are overlay CONTAINERS, which are not themselves focusable.
- **Icon-only controls.** Zero buttons with `size="icon"` lack an accessible
  name.
- **Images.** The single `<img>` in production source carries
  `alt={file.name}`.

## Two readings the audit corrected

They are recorded here so that a later auditor does not repeat them.

1. **`focus:outline-none` is NOT a defect.** The single occurrence is paired
   with `focus-visible:ring-2 focus-visible:ring-ring`, which still supplies
   the visible keyboard indicator - functionally the same pairing the shared
   `Button` itself uses (`outline-none` + `focus-visible:ring-2
   focus-visible:ring-ring`). A rule that demanded a same-line focus-visible
   replacement would have produced EIGHT false positives on the overlay
   containers.
2. **The 38 "focusable element with `aria-hidden`" hits are WINDOW
   ARTEFACTS.** The scan matched an `aria-hidden` ICON that sits a few lines
   after a hidden file `<input>`; the icon is a sibling, not the input. That
   class has ZERO real defects, and it is not statically assertable this way -
   it belongs to a DOM-level audit.

## What this audit does NOT cover

- Contrast ratios (4.5:1 for text, 3:1 for large text and UI) - the tokens
  document states them; they are not measured here.
- The full keyboard WORKFLOW of every screen - the paths a keyboard user
  actually walks. This audit covers the shell-level mechanisms.
- Screen-reader announcement of every dynamic state.

## Revert-proofs

| Proof | How |
| --- | --- |
| The skip link is load-bearing | Removing the skip link from the shell makes `keyboard-screen-reader-audit.test.tsx` fail; restoring it passes. |
| The announcement is load-bearing | Removing the route announcer makes the same file fail; restoring it passes. |