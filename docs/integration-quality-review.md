# v1 Integration Quality Review — `eiams-frontend-e24`

Final review of the Cross-module verification workstream, run as
`eiams-frontend-e24-t10` after children t01–t09 closed. Two independent axes
were reviewed in parallel: **standards/architecture** (does the code hold up read
as one system) and **spec/coverage** (does the workstream deliver what it
claimed, and is any evidence overstated).

This document is the epic's acceptance record and handoff. It reports the
review's findings, the four defects fixed here, what was deliberately left, and
what a successor needs to know.

---

## Verdict

**The epic should close.** Both success criteria are met.

Criterion 1 — *all child tasks closed with acceptance evidence* — is met, and to
an unusually high standard. Every quantitative claim in every verification
document was independently reproduced: the full suite is **245 files / 1708
tests** green, and the per-file counts quoted in t06/t07/t08/t09 docs
(`rbac-route-guard-matrix` 168, `rbac-role-separation` 41, `rbac-scope-isolation`
15, `rbac-attachment-permission` 11, `policy-failure-matrix` 60,
`policy-failure-surfaces` 17) are all exact.

Not one claim checked was overstated in a material way. On balance the
workstream's prose is **more conservative than its evidence would allow**: t08
recorded two browser checks as PARTIAL rather than PASS; t07 publicly retracted
its own false "critical balance-gate gap" finding; t09's implementation agent
refused to quote a document it could not locate rather than inventing a
substitute; and four separate "what this verification does NOT prove" sections
exist. The spec axis independently re-ran the t09 claim that stashing the
production files fails 5 of 8 new cases and judged it credible on inspection.

Criterion 2 — *downstream work unblocked without unresolved architecture,
contract, business-rule, accessibility, RTL, or quality gaps* — is met **after
the work in this task**. It was not met when the review began: the review found
four live instances of the exact defect class `e24-t09` had been chartered to
fix, and found that the one genuinely undefined piece of the workstream had lost
its tracking bead. Both are addressed below.

---

## What this review found, and what it fixed

The defining pattern of this workstream's findings is a **single defect class
appearing on successive surfaces**:

> A secondary query fails, the page collapses the failure into the same value it
> uses for "not loaded" or "not present", and the UI then states something it has
> no basis to state.

`e24-t09` fixed it on the document detail page's policy read. `e24-t08` had
already found the same class on the asset detail page's custody timeline without
recognising it as a pattern. This review found four more instances, two of which
**fails open** and states a falsehood:

| # | Surface | Failure | Direction | Status |
| --- | --- | --- | --- | --- |
| B1 | Attachment delete | Failure was invisible — no alert at all, screen unchanged | silent | **fixed** |
| B2 | Attachment errors | Server's Arabic `detailAr` discarded; no refetch on 409 | silent | **fixed** |
| B3 | Issue / Transfer balance read | A failed read was presented as **zero stock** | **fails open** | **fixed** |
| B4 | Asset detail custody read | A failed read was presented as **"no custodian exists"** | **fails open** | **fixed** |

B3 and B4 are the serious ones. On the Issue and Transfer forms — the paths
`AGENTS.md` rules 3 and 5 make load-bearing — a 500 on the balance endpoint
rendered `الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح (0)` and disabled
Save. That is a factual claim about inventory the server never made, and the
operator was blocked on it. On the asset register, a failed custody read
rendered `لا توجد عهدة مسجّلة لهذا الأصل` — a claim that **nobody holds the
asset** — while the sibling page, correctly, showed an error with a retry.

Evidence and per-surface detail: `docs/partial-failure-surfaces-verification.md`.

### The B3 fix, in one line

The hook's docstring already defined `null` as *"the server says no stock is
held"*. The loop mapped a failed read to `null`, so the UI was making a
statement it had no evidence for. A failed read with no cached row is now left
out of the map entirely — `undefined` (unknown), never `null` (a claim) — and the
forms render a retryable Arabic error while still failing **closed** on Save.
The genuine insufficient-balance rule is untouched and is proven still to work
against real seed data. A background-refetch failure over a *cached* balance
deliberately keeps serving that cached value, following the `e24-t09` F-1
precedent: turning a known balance into an unexplained block would weaken
`AGENTS.md` rule 3.

---

## The tracking failure this review corrected

`e24-t09` found that `PUT /inventory-counts/{countId}/lines` — the only contract
operation with two-level optimistic concurrency (session `countRowVersion` plus
per-line `rowVersion`) — has **no documented apply semantics**. The 409 carries no
per-line attribution, so it is undefined whether a save of N lines with one stale
line applies the other N−1 or rejects everything.

The agent correctly refused to guess. **The orchestrator then failed to ensure a
bead was filed**, so the workstream's single genuinely undefined behaviour was
untracked at the moment of this review. It is now `eiams-frontend-3wv1`, and it
matters more than "undefined behaviour" sounds, because it is live in the v1 UI:
`toCountLineUpdateRequest` sends a multi-line batch, and
`useUpdateCountLinesMutation` has no `onError` at all, so a 409 is currently
unreported as well as undefined.

Filed as MAJOR, not BLOCKER: the behaviour is undefined rather than known-wrong,
and no closed task's claim is contradicted. But it is the single item that made
criterion 2 not fully met, and it cost one `bd create` to clear.

---

## Recorded, not fixed — and why

The review surfaced substantially more than it fixed. All of it is filed, with
the reasoning recorded, because the disposition matters as much as the defect.

### Follow-ups from prior tasks in this workstream

| Bead | Subject |
| --- | --- |
| `eiams-frontend-2n3e` | Audit row links share a truncated accessible name |
| `eiams-frontend-jkel` | Custody mutations invalidate a query key that matches nothing |
| `eiams-frontend-ml4s` | Dev mock: no closed custody row, no multi-page movements |
| `eiams-frontend-14lp` | Seeded adjustments are listed but not openable |
| `eiams-frontend-y4i3`, `0akh` | Per-`mutationFn` idempotency keys (count, custody dialogs) |
| `eiams-frontend-farn` | Feature-local `Idempotency-Key` header, forbidden by name |
| `eiams-frontend-n31q` | Signed-original reason ownership |
| `eiams-frontend-8haa` | `SYSTEM_ADMIN` / `DATA_MANAGER` ratification |

### Filed by this review

| Bead | P | Subject |
| --- | --- | --- |
| `eiams-frontend-3wv1` | 2 | Count-lines batch partial-apply semantics undefined; 409 unhandled |
| `eiams-frontend-2do3` | 1 | **No sign-out exists anywhere in the application** |
| `eiams-frontend-9l0h` | 2 | Failed unit-conversion read silently narrows the line's unit selector (fails open) |
| `eiams-frontend-xlfs` | 2 | The composition-standard test asserts documentation text, not code |
| `eiams-frontend-85dy` | 3 | De-duplicate query-key prefix, error-toast shape, mock helpers |
| `eiams-frontend-bq3t` | 3 | Remove tautological and self-owned assertions from the e24 suites |
| `eiams-frontend-7eqp` | 3 | Over-balance message mixes Arabic-Indic and Latin numerals |

### Deliberately not fixed here, with reasons

- **No sign-out (`2do3`, P1)** is the most significant open item. `useLogoutMutation`
  is exported and has **zero references anywhere in `src/`**, so the implemented
  `POST /auth/logout` contract operation is unreachable and a user cannot end
  their session on a shared workstation. This was not fixed here because wiring a
  user menu is a UI feature with design decisions, not an integration-review fix.
  It is filed P1 for an owner decision, not deferred silently.
- **`9l0h`** is the same defect class as B4 and also fails open, but it is one
  component (`UnitSelector`) with no sibling contradiction to reconcile, so it
  belongs in a focused task rather than a review.
- **The de-duplication bundle (`85dy`)** is six mechanical items with existing
  helpers to reuse. Bundling them with the B-class fixes would have made this
  task neither reviewable nor atomic.
- **`xlfs`** is arguably the highest-leverage follow-up: the test that guards the
  standard every task in this epic was verified against asserts only that the
  document still contains certain strings, and would pass unchanged if every
  service violated every rule. That is the mechanism by which the defect class
  above kept recurring.
- **Doc citation drift** — several verification docs cite `file.ts:NNN` line
  numbers that later commits moved. Recorded rather than mass-edited; the durable
  fix is to cite symbols, not line numbers.

---

## Corrections made to this workstream's own records

A review that only finds other people's errors is not a review. These were found
in the artifacts this epic produced, and were corrected:

1. **`docs/concurrency-partial-failure-verification.md`** carried a "No browser QA
   was performed" bullet that directly contradicted its own 11-row browser QA
   table in the same file. In a document whose purpose is to be acceptance
   evidence, a self-contradiction is worse than an omission. Corrected, with the
   in-card `ErrorState` visual concern it raised now recorded as resolved.
2. **`src/shared/documents/policy-blocker-codes.ts`** carried a header comment
   claiming the module "removes the defect by giving every consumer one exported
   predicate", plus a claim that the action bars drop duplicate blockers and that
   a test enforces it. **None of that was true** — `attachment-panel.tsx` still
   matches with its own narrow `startsWith`, the action bars render blockers
   unfiltered, and no such test file exists. An engineer picking up `n31q` would
   have been actively misled. The header now states the real state and points at
   the tracking bead.
3. **Two beads filed by the t09 agent were already obsolete** when the review
   reached them — one for the truncated `design` field (which the orchestrator
   had already repaired) and one requesting browser QA (which the QA pass then
   performed). Both were closed with reasons rather than left to rot.
4. **`eiams-frontend-s9x7` and `6lqw`** overlap on the same parallel-load
   flakiness, `6lqw` being the superset. Merge them; noted here for whoever
   picks them up.

---

## Handoff

### State

- Full quality gate green: **245 test files / 1708 tests**, `typecheck` 0 errors,
  `lint` 0 errors with the 5 documented baseline warnings (`j90m`),
  `format:check` clean, production build ok.
- Cross-module journeys verified: Receiving, Opening, Issue → custody → Return,
  atomic Transfer, Count → Adjustment, Disposal, asset registry and movement
  ledger, custody timelines, audit list/detail/redaction, RBAC and scope
  isolation, the policy failure matrix, 409 recovery and partial failure.
- No RTL violations of substance: exactly one physical-direction Tailwind class
  in 586 source files, and it is correct and commented. No English leaking into
  user-facing text. All 22 icon-only buttons carry accessible names.
- Commit history on `codex/e24-t07` is 14 commits ahead of `origin/main`,
  unpushed. **Nothing has been pushed or synced; the user retains that decision.**

### What a successor should know

1. **The defect class is the thing to remember, not the individual fixes.**
   "A failed read rendered as if it were a fact" appeared on the document policy
   read, the asset custody timeline, the issue/transfer balance, and the unit
   selector. Any new page that renders a second query alongside its primary one
   should be checked for the same collapse. `9l0h` is the one instance still
   open.
2. **A test suite proves the paths it exercises; it does not enumerate the
   surfaces that share a data source.** `e24-t08` fixed `AssetCustody.toTs` and
   `formatDateTime` on `/assets/:assetId/custody`, the suite went green, and the
   *same two defects* were independently present on `/assets/:assetId`. Only a
   rendered pass found them. This is the strongest argument in the epic for why
   browser QA is mandatory rather than optional.
3. **A static proof is the correct proof for an absence.** Read-only-ness cannot
   be demonstrated by calling a mutation that does not exist — the test would
   pass vacuously. `immutable-ledgers-audit.test.tsx` scans source instead and
   says why in the file. That reasoning generalises to every append-only surface.
4. **`bd update --design` silently truncated a 7461-character design field to
   295 characters** when passed as a PowerShell inline argument. The loss is
   silent and a later reader would assume the design was simply short. Use
   `--design-file` for anything longer than a sentence. Caught only because the
   implementation agent had been briefed separately and could not reconcile the
   two versions. (`0mhq`.)
5. **Two tasks in this workstream (`t06`, `t07`) each independently reached a
   wrong diagnosis by reading a stale tree** without checking `origin/main`; `t07`
   then retracted its finding publicly. Diff against `origin/main` before
   diagnosing a doc-vs-code contradiction.
6. **Master data is unpinned.** Every document line, balance, movement, asset and
   custody row in the cross-module scenario graph resolves its material,
   warehouse and site through a hand-built `NamedReference`. No test asserts that
   `NamedReference` matches what the catalog/organization modules actually read.
   If it drifts, the entire cross-module corpus stays green while the real UI
   shows a different label. One `toMatchObject` against a real response would
   close it.
7. **Three of the epic's four core journeys — receiving/opening, issue/custody/
   return, and atomic transfer (`t02`, `t03`, `t04`) — have no verification
   document.** Their evidence is the test file plus a bead `notes` field, and
   bead notes were demonstrably allowed to go stale in this very workstream. A
   successor reading only `docs/` would not find that those journeys were ever
   verified. This is the largest documentation gap in the epic, and it is the
   one item here not filed as a bead because it is a documentation task rather
   than a defect.
8. **The capability gate and the insufficient-balance block are verified at the
   predicate layer only**, never as a rendered block on a real page.
   `AGENTS.md` rules 3 and 6 therefore have predicate coverage, not journey
   coverage.

### Explicitly not attributable to this workstream

The reports/KPI module is unimplemented (owned by `e23`; `reports` and
`dashboard` resolve to `routePlaceholderPage`). The 5 baseline lint warnings
(`j90m`). `whhu.11` backend role-scope enforcement. Everything under `o098.*`,
`vi65`, and `whhu.*`. The `rowVersion` → `expectedRowVersion` contract move: this
workstream correctly verified against **this repo's** contract, which is the right
scope for a frontend verification task, and `whhu.19` owns the reconciliation.
