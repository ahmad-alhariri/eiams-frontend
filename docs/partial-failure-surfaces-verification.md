# Partial-failure surfaces — verification

Implementation slice: `eiams-frontend-e24-t10`. This slice closes the last three
live instances of the defect class `eiams-frontend-e24-t09` was chartered to fix —
**a secondary query or mutation failing and the screen rendering as if nothing
had failed** — and adds no new server-state infrastructure.

## The defect class, and where it was already closed

`eiams-frontend-e24-t09` found three defects inside the already-documented
concurrency recovery contract. One of them (its F-1) is exactly this class: a
failed *secondary read* collapsed into the same value as "still loading" and the
page rendered a fully loaded screen with a dead surface and no reason. The epic's
final review then found four **more** live instances of the same class on other
surfaces, none of which t09's brief covered. This document records those four.

The cross-reference is deliberate: `docs/concurrency-partial-failure-verification.md`
is the ruling source for the whole class (including the "request-level partial
application is FORBIDDEN" half, which this slice also honours), and the naming,
table shape, and "what this does not prove" section deliberately mirror it so the
two artifacts read as one body of evidence.

### The ruling

> "Model partial failure independently where a page has multiple queries."
> — `docs/SAD.md:230` (SAD §12 "Resilience")

> "6. **Partial failure.** Header and detail load independently; a failed read
> shows the shared Arabic error state with retry, without hiding the other
> surface."
> — `docs/audit-detail-contract-decision.md:152` (D-AUD-02 rule 6)

> "Every upload/delete carries the document `rowVersion`. A `409` response
> discards any optimistic UI state and refetches document detail, policy, and
> attachments before rendering."
> — `docs/signed-original-gate-decision.md:103-104` (D-ATT-01)

> "6. On `409`, discard optimistic UI state, refetch detail/policy/history, and show
> the Arabic-safe conflict message. On `403`, preserve the document view but
> remove unavailable actions after refetch."
> — `docs/document-lifecycle-history-contract-decision.md:226-228` (D-LIFE-01 rule 6)

> "On a contract `409`, use `isConflictError(error)` only to select the
> feature's documented recovery: discard stale transient UI and refetch its
> authoritative detail/policy/history keys. A 409 can also be a state or
> idempotency conflict, so no generic helper may assume a particular recovery
> or retry it automatically."
> — `docs/feature-service-composition-standard.md:87-91`

Plus the two load-bearing `AGENTS.md` business rules for the outbound forms:

> "3. **Balance check:** Issue/Transfer documents must show available balance per
> line and block submission if insufficient."
> "5. **Negative stock:** Blocked in v1. UI must prevent issue quantity > balance."
> — `AGENTS.md` §"Key Business Rules the UI Must Enforce"

## The four surfaces

| # | Defect and symptom | Named rule violated | Fix | How it is proven |
| --- | --- | --- | --- | --- |
| **B1** | **A failed attachment DELETE produced zero user-visible feedback.** `use-document-attachments.ts:107` set `deleteError` and returned it at `:162`, but `DocumentDetailAttachmentMutationProps` (`document-detail-page.tsx:66-69`) is a `Pick<AttachmentPanelProps, …>` that did not include the prop, **and** `AttachmentPanel` had no `deleteError` prop at all. The signed-original delete button (reachable from `document-detail-page.tsx:516`) could fail with 409/403/network and the screen did not change, said nothing, and offered nothing. | `docs/SAD.md:230`; `docs/audit-detail-contract-decision.md:152`; D-ATT-01 (`docs/signed-original-gate-decision.md:103-104`) | `deleteError?: string \| null` added to `AttachmentPanelProps` and rendered as its own `role="alert"` region (`attachment-panel.tsx`), because a failed delete targets an already-stored row and has no pending row to render inside. `'deleteError'` added to the page's `Pick<>`, forwarded to `<AttachmentPanel>`, and passed from `attachmentManager.deleteError`. The **page's `Pick` was the narrower of the two prop types** — the panel had no prop at all, so both had to change. | `src/test/partial-failure-surfaces.test.tsx` (B1) drives the real panel flow on a Draft Receiving document: confirm dialog → `DELETE` → 409 → the alert appears, the attachment row is still listed, and the delete was issued exactly once. Plus a panel-level unit case in `attachment-panel.test.tsx`. |
| **B2** | **Attachment failures discarded the server's Arabic `detailAr` and never refetched on 409.** `use-document-attachments.ts:86`/`:107` kept only `normalizeApiError(error).titleAr`, so the specific Arabic reason the server sent was thrown away and the user saw only the generic contract sentence. Neither path invalidated the document cache, so a 409 left the panel describing a document the server had already changed — the exact recovery D-LIFE-01 rule 6 and D-ATT-01 require. The file's own docstring admitted it: "the full 409/403 recovery flow lands in a later task". | D-ATT-01 (`docs/signed-original-gate-decision.md:103-104`); D-LIFE-01 rule 6 (`docs/document-lifecycle-history-contract-decision.md:226-228`); `docs/feature-service-composition-standard.md:87-91` | New module-local `attachmentErrorMessageAr()` returns `apiError.detailAr ?? apiError.titleAr` — the server's sentence when it has one, the contract's own sentence when it does not, and never an invented cause. New `recoverFromConflict()` calls the file's existing `useInvalidateDocumentDetail()` **only** when `isConflictError(error)` is true, on both the upload and the delete mutation. Docstrings rewritten to describe what the code now does. | Same B1 suite: the 409 case asserts the alert carries the problem's `detailAr` and explicitly does **not** contain the generic `titleAr`, and that the detail request count rose. `use-document-attachments.test.tsx` adds three cases: 409 delete (detailAr + refetch), 403 delete (`detailAr: null` → titleAr, and **no** refetch, since a 403 says nothing about document freshness), and a 409 upload. |
| **B3** | **A failed per-line BALANCE read was reported to the user as ZERO STOCK** — the highest severity of the four. `use-issue-line-balances.ts:94-100` only checked `query.isLoading`; after an error `isLoading` is `false` and `data` is `undefined`, so the row fell through to `balanceByMaterialId.set(materialId, null)` — which that file's own docstring (`:25-27`) defines as "**the server says no stock is held**". Both consumers then printed `الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح (0)` and disabled Save: a **factually false statement about inventory**, with no error and no retry, on the two forms `AGENTS.md` rules 3 and 5 make load-bearing. | `AGENTS.md` rules 3 and 5; `docs/SAD.md:230`; `docs/audit-detail-contract-decision.md:152` | The hook's result gained `isError` and a `retry()` that refetches only the failed lookups. A failed lookup with no cached row is now left **out** of the map: `undefined` (unknown) instead of `null` (a claim). Both forms render one shared `BalanceReadError` — a single `role="alert"` Arabic line plus a `Button variant="outline" size="sm"` retry — instead of a per-line wrong number, and both add `balancesFailed` to `saveDisabled`, so the action **fails closed** while the message stays honest. | `use-issue-line-balances.test.tsx` (3 cases: absent key + `isError` + retry recovery; a sibling lookup that succeeded is undisturbed; a background refetch failure over cached data keeps serving the cached row). `issue-document-form-page.test.tsx` and `transfer-document-form-page.test.tsx` each add a full form test: 150 requested against a **failing** read asserts the Arabic failure line, asserts `/تتجاوز الرصيد المتاح/` is **absent**, asserts `الرصيد المتاح (0)` never appears in the document, asserts Save is disabled with nothing posted, then retries and asserts the **real** over-balance block for a recovered read of 100. |
| **B4** | **A failed CUSTODY read rendered as "no custody exists" — failing OPEN.** `asset-detail-page.tsx:117-118` was `custodyQuery.isError \|\| timeline.length === 0 ? <p>لا توجد عهدة مسجّلة لهذا الأصل.</p>`, so a failed read claimed the asset has **no custodian at all**, with no retry. This directly contradicted the sibling page `asset-custody-history-page.tsx:89-103`, which reports the same failed read correctly. Two smaller issues in the same file: the hand-rolled `<button className="rounded-md border border-border px-4 py-2 text-sm">` retry (defect F-5 in t08, replaced there, still here, and with no `data-slot="button"`). | `docs/SAD.md:230`; `docs/audit-detail-contract-decision.md:152`; the repo's own two-surfaces rule (t08 replaced the same hand-rolled button in the sibling page) | The ternary is split into four: `isLoading` → spinner, `isError` → the same shared `ErrorState` + `Button variant="outline" size="sm"` retry used at `asset-custody-history-page.tsx:90-103`, `length === 0` → the existing "no custody" copy, else the timeline. The hand-rolled button is replaced with the shared `Button`. | `asset-detail-page.test.tsx` (extended, 2 new cases): a 500 custody read with a **successful** asset read shows the shared `ErrorState` with the retry, never the "no custody" sentence, and recovers into the timeline on retry; a failing asset read shows a retry carrying `data-slot="button"` and the `size="sm"` class, with no `button:not([data-slot="button"])` anywhere in the page. |

## New shared code, and why

Exactly one new shared unit was added:
`src/shared/documents/components/balance-read-error.tsx`.

B3 is the only one of the four that has to behave identically in two places
(the Issue form and the Transfer form), and AGENTS.md rules 3 and 5 make that
behaviour load-bearing: if one form says "تعذّر جلب الأرصدة المتاحة" and the
other says something else, one of them is wrong. Ten lines of Arabic copy plus a
retry button duplicated across two pages is a divergence risk, not a saving.
B1, B2, and B4 each needed a change in exactly one place and got none — B1 and
B2 reused `useInvalidateDocumentDetail`, `normalizeApiError`, `isConflictError`,
and the panel's existing `role="alert"` convention; B4 reused the sibling page's
`ErrorState` + `Button`.

No new query keys, no new services, no new hooks, no optimistic updates, no
automatic retries. The raised Arabic copy was re-read from the server's own
`detailAr`/`titleAr` or written to describe **only** what the browser observed
(a read failed; nothing about why).

## Evidence: every new test was confirmed to fail against the reverted code

A test that passes whatever production does is worse than no test. Each
production change was therefore reverted file-by-file (`git checkout --` on the
owning files) and the affected suites re-run. Test count for the whole suite
was 245 files / 1708 tests before and after each cycle.

| Reverted change | Tests that FAILED with the fix removed |
| --- | --- |
| **B1** — `attachment-panel.tsx` + `document-detail-page.tsx` | 3 failed / 20 run<br>• `partial-failure-surfaces` › B1 › renders the failed delete in the attachment panel instead of leaving the screen unchanged<br>• `partial-failure-surfaces` › B2 › shows the problem detailAr … and refetches on a 409 *(the alert does not exist at all, so B2 cannot pass either)*<br>• `attachment-panel` › renders the parent delete error as an alert and keeps the attachment listed |
| **B2** — `use-document-attachments.ts` | 3 failed / 11 run<br>• `partial-failure-surfaces` › B2 › shows the problem detailAr rather than the generic titleAr, and refetches on a 409<br>• `use-document-attachments` › exposes the server Arabic detail on a 409, keeps the attachment, and refetches the detail<br>• `use-document-attachments` › surfaces the server Arabic detail of a failed upload, not the generic title |
| **B3** — `use-issue-line-balances.ts` + both form pages | 5 failed / 16 run<br>• `use-issue-line-balances` › leaves a failed lookup unknown instead of mapping it to zero stock, and retries it on demand<br>• `use-issue-line-balances` › reports the failure without disturbing the lookups that succeeded<br>• `use-issue-line-balances` › keeps a cached balance when a background refetch of that same material fails<br>• `issue-document-form-page` › reports a failed balance read honestly, blocks Save, and recovers on retry<br>• `transfer-document-form-page` › reports a failed balance read honestly, blocks Save, and recovers on retry |
| **B4** — `asset-detail-page.tsx` | 2 failed / 7 run<br>• `asset-detail-page` › reports a failed custody read as an error with a retry, never as "no custody"<br>• `asset-detail-page` › uses the shared retry Button, not a hand-rolled element, for the asset read failure |

Two of the new tests are **verify-only guards** and are honestly reported as
such: they pass both before and after the change, because they pin behaviour
that was already correct and that the fix had to avoid breaking —

- `use-document-attachments` › falls back to the problem title when the failure
  carries no Arabic detail (a `detailAr: null` problem rendered `titleAr`
  before the fix too; the point is that the new `detailAr ?? titleAr` did not
  make the fallback unreachable, and that a 403 does not trigger a refetch);
- `attachment-panel` › renders no delete alert while the parent reports no
  failure (a guard against a permanently-visible alert).

The B3 form tests are also the ones that prove the fix did **not** weaken
`AGENTS.md` rule 3: after the retry the same form, with the same 150 requested
against a recovered balance of 100, produces the genuine over-balance block and
still refuses to post. A "fix" that simply removed the balance gate would fail
those two cases.

## What this verification does NOT prove

Everything below is a **server** guarantee that no browser test can observe, and
none of it is claimed here.

- **Atomicity and rollback.** That a post writes its document, stock movements,
  asset movements, and custody closure in one transaction — and that a partial
  write rolls back — is enforced by the backend. A browser test can only show
  which requests the page issued and what it rendered afterwards. These four
  surfaces are **presentation-layer truths about what the UI claims when a read
  or a mutation fails**, not claims about what the server did, did not do, or
  would do on retry. `HttpResponse.error()` and MSW's 500/409 fixtures are the
  mock's choices, not the backend's error taxonomy.
- **The real server's 409 semantics.** The suite decides what counts as a
  conflict by returning a contract-shaped `409` problem. Which situations the
  backend answers with `409` versus `403` or `422` is its decision. Following
  `docs/feature-service-composition-standard.md:87-91`, nothing here assumes
  *why* a 409 happened: the recovery is "refetch authoritative state and speak
  Arabic", which is correct for a stale row version, a state conflict, and an
  idempotency conflict alike.
- **That the server actually returns `detailAr`.** B2 prefers `detailAr` when
  the problem carries one and falls back to `titleAr` when it does not. Which
  problems the backend populates with a `detailAr` is not verified here; the
  tests pin that the browser stops **discarding** it and that the fallback stays
  reachable.
- **Whether the real balances endpoint can fail at all.** B3's failing read is a
  mock. What is proven is that *if* the read fails, the form no longer states
  that the warehouse holds no stock.
- **The balance number itself is still server-authoritative.** The hook reads
  `/inventory/balances?warehouseId&materialId`; the tests assert which request is
  issued and what the UI then claims. They assert nothing about the server's
  balance arithmetic, its stock reservation, or its race behaviour under
  concurrent movement.
- **Retry counts are not production counts.** Tests build a `QueryClient` with
  `retry: false` so a deliberately failing read settles in one attempt;
  production `createQueryClient()` uses `retry: 1`, so a real failing read takes
  two attempts and about a second before it settles, and the user sees the
  failure later than the test clock shows.
- **No browser QA was performed for this slice.** The Arabic copy, the RTL
  layout of the new `BalanceReadError` inside the two forms, and the placement of
  the new `attachment-delete-error` line inside the panel were verified only
  through Testing Library queries. `BalanceReadError` is a new inline alert
  composition that no page rendered before, and the panel's new alert sits
  outside both attachment sections — both are worth one rendered pass.
- **No accessibility audit.** The new regions use `role="alert"`, matching the
  convention the pages already use, and the retry buttons are real
  design-system buttons reachable by keyboard. No screen-reader pass, focus
  order check, or contrast check was run.
- **`deleteError` is still per-attempt state, not a reconciliation.** If two
  deletes fail in a row, the last message wins and the earlier one is lost. That
  is the pre-existing shape of `uploadError` too and was deliberately not
  redesigned here.

## Deliberately not implemented

| Not implemented | Why |
| --- | --- |
| **Any optimistic update (`onMutate` / `updateQueryData`)** | Forbidden by `docs/feature-service-composition-standard.md` and D-LIFE-01 rule 5; the repository has none, and a standing test keeps it that way. D-LIFE-01 rule 6's "discard optimistic UI state" is therefore vacuous here. B2's 409 path only refetches. |
| **Automatic retry of a rejected upload/delete or of a 409** | `docs/feature-service-composition-standard.md:90-91` forbids it: only the user can resolve which kind of conflict occurred. Every new test pins "exactly one attempt". |
| **A shared conflict-recovery dialog for attachment mutations** | The document lifecycle path already has `useDocumentConflictRecovery` + `DocumentConflictDialog` for a *stale cached document the user is about to act on*. An attachment conflict surfaces as an inline alert next to the control the user just used; adding a modal would be a UX decision, not a verification fix. |
| **Narrowing the Arabic `detailAr`/titleAr choice to lifecycle mutations** | Lifecycle mutations show both (toast title + description). A single-line inline alert has room for one sentence, and the server's `detailAr` is the more specific of the two. Documented in `attachmentErrorMessageAr`. |
| **Rendering `deleteError` inside the attachment row that failed** | The panel is presentational and stateless: it does not own which row was last removed, and a failed delete leaves every row unchanged, so there is no row to attach the message to. The panel-level alert is the honest placement. |
| **Reusing `ErrorState` for B3** | `ErrorState` is a `min-h-64` full-card block. Two of them inside a form's line section would dominate the form; the existing form convention for an inline Arabic failure is a `role="alert"` line, and that is what `BalanceReadError` is. |
| **Reporting *which* lines failed** | The brief asked for one line rather than a per-line wrong number. Naming the affected lines would require a per-material error surface in the hook and the editor seam, for no additional truth. |
| **Treating a background-refetch failure as a balance failure** | Deliberate, and cited in the hook docstring: it would turn a known balance into an unexplained block, weakening `AGENTS.md` rule 3. This follows the e24-t09 F-1 precedent (`docs/concurrency-partial-failure-verification.md`). |
| **Touching the pre-existing 5 ESLint warnings** | Out of scope; the baseline is tracked separately (bead `j90m`). |
| **Committing, pushing, or closing the bead** | Explicitly out of scope for this task; the orchestrator owns tracking. |

## Change log

Production:

- `src/shared/documents/attachment-panel.tsx` — B1: `deleteError` prop and its
  `role="alert"` region.
- `src/shared/documents/pages/document-detail-page.tsx` — B1: `'deleteError'`
  in the `Pick<>`, forwarded to the panel, passed from the manager.
- `src/shared/documents/use-document-attachments.ts` — B2:
  `attachmentErrorMessageAr()` (`detailAr ?? titleAr`) on both mutations,
  `recoverFromConflict()` invalidating the scoped detail branch on a 409 only,
  docstrings rewritten to match.
- `src/modules/issue/hooks/use-issue-line-balances.ts` — B3: `isError` +
  `retry()` on the result; a failed lookup is never mapped to `null`; docstring
  rewritten to state the `null` vs `undefined` contract and why.
- `src/shared/documents/components/balance-read-error.tsx` — **new**, the shared
  inline failure surface for B3.
- `src/modules/issue/pages/issue-document-form-page.tsx` and
  `src/modules/transfer/pages/transfer-document-form-page.tsx` — B3: render
  `BalanceReadError`, fail the save closed on an unverifiable balance.
- `src/modules/asset/pages/asset-detail-page.tsx` — B4: custody read split into
  pending / failed / empty / rows; hand-rolled retry replaced with the shared
  `Button`.

Tests: 13 new cases, 5 files touched + 2 new suites.

- `src/test/partial-failure-surfaces.test.tsx` — **new**, 2 cases (B1, B2) on
  the real `DocumentDetailPage` attachment flow.
- `src/shared/documents/attachment-panel.test.tsx` — +2 (B1: renders the delete
  alert / renders none when there is no failure).
- `src/shared/documents/use-document-attachments.test.tsx` — the 409 delete case
  rewritten for the new contract and extended to assert the refetch; +2 cases
  (403 fallback with no refetch, 409 upload `detailAr`).
- `src/modules/issue/hooks/use-issue-line-balances.test.tsx` — +3 (B3).
- `src/modules/issue/pages/issue-document-form-page.test.tsx` — +1 (B3), and the
  file gained the MSW handlers and a session the balance tests need.
- `src/modules/transfer/pages/transfer-document-form-page.test.tsx` — +1 (B3).
- `src/modules/asset/pages/asset-detail-page.test.tsx` — +2 (B4).
