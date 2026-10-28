# Accessibility audit

**Status:** Enforced in CI
**Bead:** eiams-frontend-e25-t01
**Date:** 2026-10-29
**Mechanism:** src/test/accessibility-audit.test.ts (a source scan over the pinned production file set)

## Why the audit is built this way

No accessibility tooling is available to this repository. xe-core,
jest-axe, @axe-core/react, itest-axe and pa11y are absent from both

ode_modules and pnpm-lock.yaml, so no rule engine can be run against the
rendered tree.

The audit is therefore built from the two things the repository does have:
the house source-scan idiom (a pinned production file set, one detector per
rule, a synthetic negative control per detector) and Testing Library's
role-based queries, which are already an accessible-name assertion wherever
the suite uses getByRole with a name.

The rules are grounded in the house accessibility spec, docs/design-tokens.md:

- "Interactive focus uses the Mountain Teal ring with a visible 2px treatment"
  and "ring | mountain-teal | Keyboard focus indicator".
- "Respect prefers-reduced-motion whenever a new motion primitive is
  introduced".
- "Normal text requires at least 4.5:1 contrast; large text and graphical UI
  require at least 3:1".

## The rules

| Rule | Standard | What it detects | Result |
| --- | --- | --- | --- |
| Natural focus order | WCAG 2.4.3 | a positive 	abIndex overriding the document order | 0 occurrences |
| Image alternatives | WCAG 1.1.1 | an <img> with no lt | 0 occurrences (the single image carries lt={file.name}) |
| No stolen focus | WCAG 3.2.2 | utoFocus | 0 occurrences |
| Reduced motion | WCAG 2.3.3 | an infinite animation with no motion-reduce: guard | **3 occurrences - fixed** |
| Visible focus indicator | WCAG 2.4.7 | ocus:outline-none with no ocus-visible: replacement | 0 occurrences |

The reduced-motion rule deliberately targets only the INFINITE animation
family (nimate-spin, nimate-pulse, nimate-shimmer, nimate-bounce,
nimate-ping). The one-shot enter and exit transitions (nimate-in,
nimate-out) are guarded by a different mechanism
(motion-reduce:data-open:animate-none), so they are not part of this rule.

## The three defects that were found and fixed

Three infinite spinners had no prefers-reduced-motion escape. An infinite
spinner is the WCAG 2.3.3 case: motion that lasts longer than five seconds is
not purely decorative, and a user who has asked the system for reduced motion
must not be given a loop they cannot stop.

| File | Before | After |
| --- | --- | --- |
| src/shared/ui/data-table-server.tsx | nimate-spin text-muted-foreground | nimate-spin text-muted-foreground motion-reduce:animate-none |
| src/shared/ui/print-button.tsx | size-4 animate-spin | size-4 animate-spin motion-reduce:animate-none |
| src/shared/ui/toaster.tsx | nimate-spin text-muted-foreground | nimate-spin text-muted-foreground motion-reduce:animate-none |

The fix is the house pattern, already used by the shared Button
(nimate-spin motion-reduce:animate-none) and by the shared
LoadingSpinner (nimate-spin text-accent motion-reduce:animate-none).

## Two readings that the audit corrected

Recording these because a later auditor would otherwise repeat them.

**ocus:outline-none is not a defect.** The tree contains exactly one use,
in src/modules/warehouse/components/warehouse-capabilities-editor.tsx, on
an ria-pressed toggle button whose own comment promises "a visible focus
ring". It is written ocus:outline-none focus-visible:ring-2
focus-visible:ring-ring, so the native outline is replaced by the Mountain
Teal ring on keyboard focus. That is the same pairing the shared Button
uses, so removing the outline is a spelling difference, not a loss of the
indicator. A naive "outline-none needs a focus-visible replacement" rule
would have reported eight false positives, because the eight bare
outline-none uses are overlay CONTAINERS (the dialog and alert-dialog
panels, the dropdown-menu and popover popups, the select and combobox item
rows, the toast surface) that are not focusable themselves - Base UI manages
focus on the item inside them.

**"aria-hidden on a focusable element" produced 38 hits, all artefacts.** A
window scan reports the icon a few lines after a hidden file input as if the
input carried ria-hidden. In src/shared/feedback/file-dropzone.tsx the
ria-hidden is on the upload ICON, a sibling of react-dropzone's hidden
file input. The class has no real defect, and a window scan cannot decide it,
so it is not asserted statically; it belongs to a rendered audit.

## What this audit does not cover

Contrast (4.5:1 for text, 3:1 for large text and graphical UI) is not
statically decidable and is not asserted here. Neither is the
"aria-hidden must not be focusable" rule, nor the keyboard and screen-reader
workflow, which is what the next bead in this chain,
eiams-frontend-e25-t02, exists to cover.

## Revert-proof

Removing the motion-reduce:animate-none guard from
src/shared/ui/print-button.tsx makes src/test/accessibility-audit.test.ts
fail on "respects prefers-reduced-motion for every infinite animation";
restoring it makes the audit pass again. Each detector additionally has a
synthetic negative control proving that it can fail, so a rule that can never
fire is caught by the audit itself.