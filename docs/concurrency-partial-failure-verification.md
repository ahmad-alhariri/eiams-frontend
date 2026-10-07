# Concurrency resilience and partial failure — verification

Implementation slice: `eiams-frontend-e24-t09`. This slice proves the
already-documented concurrency recovery contract, fixes the three defects
verification found inside it, and adds no new concurrency infrastructure.

## Source ruling: what "partial failure" means

Two different things get called partial failure in this system, and the docs
rule on both. They are not interchangeable, and the verification keeps them
apart.

**1. Query-level partial failure is REQUIRED behaviour.** A page that issues
several independent queries must model each one separately: a failed read
degrades only its own surface, shows a retryable Arabic error, and never hides
the other surfaces.

> "Model partial failure independently where a page has multiple queries."
> — `docs/SAD.md:230` (SAD §12 "Resilience")

> "6. **Partial failure.** Header and detail load independently; a failed read
> shows the shared Arabic error state with retry, without hiding the other
> surface."
> — `docs/audit-detail-contract-decision.md:152` (D-AUD-02 rule 6)

D-AUD-02 states the rule for the audit module specifically, but it is written
as a general principle and SAD.md:230 states it generally for every page. This
slice applies it to the shared document detail page, which has two such queries
(document detail and document policy).

**2. Request-level partial application is FORBIDDEN.** A single lifecycle
request is all-or-nothing. The browser may not simulate, approximate, or
partially apply it, and may not append a guessed event to fill the gap.

> "Every action validates the current `rowVersion`. A stale request returns
> `409` with the current status/version/policy and changes nothing. Submit,
> Post, Reject, Revise, Cancel, and Reverse accept an `Idempotency-Key`; replay
> with the same key and equivalent request returns the original authoritative
> result."
> — `docs/document-lifecycle-history-contract-decision.md:94-97` (D-LIFE-01)

> "5. After success, install or refetch the authoritative document/policy/history
> and invalidate affected balance, asset, custody, movement, and report queries.
> Never append a guessed event optimistically."
> — `docs/document-lifecycle-history-contract-decision.md:224-226` (D-LIFE-01
> UI rules, rule 5)

> "6. On `409`, discard optimistic UI state, refetch detail/policy/history, and
> show the Arabic-safe conflict message."
> — `docs/document-lifecycle-history-contract-decision.md:226-227` (D-LIFE-01
> UI rules, rule 6)

> "1. The **hook** creates the key with `createIdempotencyKey()` once when the
> user starts the action, and holds it so an explicit retry of the same action
> reuses the same key. Start a distinct user action with a new key, and clear
> the held key only on success.
> 2. The **service** owns the transport and attaches the header with
> `withIdempotencyKey(idempotencyKey)`. A feature must never write the
> `Idempotency-Key` header itself.
> 3. Do not add a global Axios retry interceptor for these mutations."
> — `docs/feature-service-composition-standard.md` (retry-sensitive mutations)

This rule was **amended** after `eiams-frontend-xlfs`. It previously read
"Create `createIdempotentRequest()` once… Pass its `config` to Axios", which
describes a single object flowing from the hook into Axios. A hook cannot hand an
Axios config to a service — the service is the only holder of the client — so
`createIdempotentRequest()` had **zero production call sites** while a test
asserted it existed. The F-2 fix below already used the correct two-part shape;
the rule was the thing that was wrong, and the test was pinning the error.

> "On a contract `409`, use `isConflictError(error)` only to select the
> feature's documented recovery: discard stale transient UI and refetch its
> authoritative detail/policy/history keys. A 409 can also be a state or
> idempotency conflict, so no generic helper may assume a particular recovery
> or retry it automatically."
> — `docs/feature-service-composition-standard.md:87-91`

**The reference is verified.** This slice's brief cited a
"Human-Owner-approved RESOLUTION-007" as the ruling that request-level partial
application is forbidden. The implementation agent searched `docs/`,
`.beads/issues.jsonl` and every decision-type bead, found no such identifier,
and correctly refused to quote it or invent a substitute. The artifact does
exist — it simply lives in the system docs, outside this repository:

> "RESOLUTION-007 - Transactional complete document-draft save"
> — `C:\EIAMS-SYSTEM\docs\integration\conflict-resolution.md:769`

> "The backend performs cross-field validation, child authorization,
> document-type validation, concurrency checking, replacement calculation, and
> persistence within one application transaction. **Any failure rolls back the
> complete Save operation.**"
> — `C:\EIAMS-SYSTEM\docs\integration\conflict-resolution.md:836`

That is an explicit prohibition on partial application, and it is the reason
this slice models only *query-level* degradation. The two readings are not
weighed by preference: one is required by `SAD.md:230` and `D-AUD-02` rule 6,
the other is forbidden by an approved human-owner resolution.

## Defects found and fixed

| # | Defect and symptom | Named rule violated | Fix | How it is proven |
| --- | --- | --- | --- | --- |
| **F-1** | **A partial failure silently degrades the document detail page.** `document-detail-page.tsx:836` passed `policy={policyQuery.data ?? null}`. `?? null` collapses "still loading" and "the read failed" into one value, and `evaluateActionDecision(null, …)` returns `{ presentation: 'Disabled', reasonAr: null }` for every action. One failed policy read therefore produced a fully loaded document whose **entire** lifecycle action surface silently vanished behind a permanent "بانتظار تقييم سياسة المستند من الخادم…" note — no Arabic reason, no error, no retry. `useDocumentPolicyGate` already exposed `isError`; the page read neither it nor `isLoading`. | `docs/SAD.md:230`; `docs/audit-detail-contract-decision.md:152` | **Changed the page, not the shared gate function.** `evaluateActionDecision`'s `Disabled` + `reasonAr: null` for a null policy is correct and load-bearing for a *genuinely absent* policy (D-ATT-01 indeterminate state must never enable an action), so it is unchanged. The page now computes `policyFailure = policyQuery.isError && policyQuery.data === undefined` and passes it to `DocumentDetailBody`, which replaces only the action surface with a shared `ErrorState` (Arabic title + description) carrying a `Button variant="outline" size="sm"` retry that calls `policyQuery.refetch()`. The document body above it is untouched. | `concurrency-partial-failure.test.tsx` F-1 cases: detail 200 + policy 500 → document content still renders, the `ErrorState` appears, the pending note is gone, the action bar is absent, and **no disabled button anywhere lacks an explanation**; clicking retry refetches and, once the policy succeeds, Submit/Cancel render `Enabled` per the server policy. A second case pins that a merely *pending* read still shows no error. Both fail against the pre-fix code. |
| **F-2** | **The adjustment idempotency key is not retry-safe.** `use-adjustment-actions.ts:67` and `:108` called `createIdempotencyKey()` *inside* `mutationFn`, unconditionally, on every invocation. After an ambiguous network failure (server committed, response lost) the user's next click sent a **new** key, so the server could not dedupe and the post could apply twice. The file's own comment claimed the opposite intent. | `docs/feature-service-composition-standard.md:97-101` (rule 1: create once, retain for an explicit retry); D-LIFE-01 replay protection, `docs/document-lifecycle-history-contract-decision.md:94-97` | Each hook now holds `useRef<IdempotencyKey \| null>`. The key is minted on the **first** execution (`idempotencyKeyRef.current ??= createIdempotencyKey()`), kept across failure, and cleared **only** in `onSuccess` — the same contract `document-detail-page.tsx:704-742` implements for the six generic lifecycle actions. `createIdempotencyKey()` (not `createIdempotentRequest()`) is used because `adjustmentService.postAdjustment` takes a plain key string and calls `withIdempotencyKey` itself; changing the service signature would break its existing contract test for no gain. The file's comment was rewritten to state what the code now does. | F-2 cases capture the real `Idempotency-Key` header (name read from `IDEMPOTENCY_KEY_HEADER`, not hardcoded): after a lost response, the explicit retry sends the **same** key; a third, distinct successful action sends a **different** key. A separate case proves the same-key property survives a 409 retry. Both fail against the pre-fix code. |
| **F-3** | **The adjustment 409 path toasts but never recovers, and the Arabic conflict guidance was unreachable.** `use-adjustment-actions.ts:84`/`:121` never refetched authoritative state. Worse, the guidance branch was **dead code**: the guard read `apiError.detailAr !== undefined`, but `normalizeApiError` returns `detailAr: string \| null` — never `undefined`. The condition was therefore always true, so a 409 whose problem carried no `detailAr` produced `description: null` and `CONFLICT_GUIDANCE_AR` could never render. (`toast-manager.ts:9` types `description?: ReactNode`, and `null` is a `ReactNode`, so TypeScript did not catch it. The document path at `use-document-lifecycle-actions.ts:147` uses the correct `??` form; this file was the only place in `src/` with the `!== undefined` defect.) | `docs/document-lifecycle-history-contract-decision.md:226-227` (D-LIFE-01 rule 6: refetch and show the Arabic-safe conflict message) | `onError` now calls the file's existing `useInvalidateAdjustmentScope()` when `isConflictError(error)` is true, so the scoped authoritative state is refetched — the adjustment-module analog of the document path's `reportConflict()` → `useDocumentConflictRecovery.recover()`. The guard was corrected to `apiError.detailAr !== null`, which makes the server's Arabic `detailAr` win when present and the module's Arabic conflict guidance reachable when it is not. No optimistic state is discarded because **this repo has none** — see below. | F-3 cases: a 409 on post increases the adjustment-detail request count (proving the refetch) and the toast carries the server's Arabic conflict sentence; a 409 with `detailAr: null` falls back to the module's Arabic guidance; a third case proves `postCalls` stays at 1 (no automatic retry) and the rendered status never changes. All three fail against the pre-fix code. |

### "Discard optimistic UI state" is satisfied by construction, not by new code

D-LIFE-01 rule 6 requires discarding optimistic UI state on a 409. This
repository has **zero** `onMutate` / `updateQueryData` usage, and a standing
test (`src/test/immutable-ledgers-audit.test.tsx`) scans the source to keep it
that way. There is therefore nothing to discard, and **no optimistic update was
added** — D-LIFE-01:279 rejected optimistic timeline appending, and doing so
here would have been a regression, not a fix. The F-3 "no auto-retry, status
never changes" case pins this behaviour explicitly.

## Defects NOT fixed here (found, recorded, deliberately out of scope)

| Finding | Where | Why not fixed |
| --- | --- | --- |
| **A second, unused pair of adjustment mutations has the identical F-2 defect.** `use-adjustment-queries.ts:159` (`usePostAdjustmentMutation`) and `:169` (`useReverseAdjustmentMutation`) call `createIdempotencyKey()` inside `mutationFn` with no ref. | `src/modules/adjustment/hooks/use-adjustment-queries.ts` | These hooks are referenced **only** by their own unit test; no page, component, or other module calls them. Fixing dead code is not a verification fix, and the correct resolution is probably deletion rather than repair. Filed as a bead. |
| **Four other retry-sensitive mutations mint a key per `mutate()` call.** `use-count-queries.ts:157` (`planCount`) and `:185` (`completeCount`); `custody/components/assign-custody-dialog.tsx:73`; `custody/components/transfer-custody-dialog.tsx:70`. | those files | Outside this task's named scope (document + adjustment concurrency slice). Each would need its own review of whether the key is created on the user click and retained across retries — the custody dialogs at least mint inside the submit handler, which is closer to the rule than a `mutationFn`, but that was not verified here. Filed as a bead. |
| **`use-external-party-mutations.ts:15` defines its own local `createIdempotencyKey()`** and sets the `Idempotency-Key` header by hand at `:58`, duplicating `mutation-safety.ts`. | `src/modules/organization/hooks/use-external-party-mutations.ts` | Duplicate shared infrastructure is a real defect, but removing it is a cross-module refactor unrelated to partial failure. Filed as a bead. |
| **Adjustment post success invalidates the whole `['scoped']` namespace** (`use-adjustment-actions.ts:74`) in addition to the scope-correct `invalidate()`. | `src/modules/adjustment/hooks/use-adjustment-actions.ts` | Pre-existing, and harmless-but-broad. The **new** 409 path deliberately uses only the scope-correct `invalidate()`. Changing the success path is unrelated churn. |
| **Audit-cache invalidation after mutations (D-AUD-02 §3) is still unmet**, and `use-custody-queries.ts:47`'s `['asset']` invalidation matches no scoped key. | recorded in `docs/immutable-ledgers-audit-verification.md` | Already recorded by t08. Out of scope here; the fix is a shared post-mutation invalidation helper, not a verification patch. |

## The bead's `design` field was truncated — detected and repaired

`bd show eiams-frontend-e24-t09 --json` originally returned a `design` of
exactly **295 characters**, ending mid-heading at `## Source ruling: what
partial`, and the same truncation was present in the passive export
`.beads/issues.jsonl` — so it was stored data loss, not a display artifact. It
was caught by the implementation agent, which had been handed the design only
through the orchestrator's brief and so could not reconcile its instructions
against the task record. It was a shell-quoting artifact: `bd update --design`
was passed as a PowerShell inline argument and only the leading segment was
stored.

Repaired with `bd update --design-file <path>`, which stores the full **7461
characters**; verified by reading the field back and confirming the tail is the
Evidence-required section. Tracked as `eiams-frontend-0mhq`, now closed.

The lesson is worth recording because it is not specific to this task: **a
truncated task record fails silently.** A future reader would reasonably assume
the design was simply short, and the task would appear under-specified while
looking complete. Any future task whose design exceeds a couple of sentences
should be set with `--design-file`, not `--design`.

## Browser QA

Independent Chrome DevTools MCP pass against the running dev server, with the
dev mock temporarily instrumented to reach the failure states and then fully
reverted (`git diff -- src/mocks/handlers.ts` empty at the end; only the five
intended t09 paths remained modified). Screenshots in the temp QA folder.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| C1 | A failed policy read degrades independently | **PASS** | `…/policy` → 500 while detail `[200]` and history `[200]`; card showed `تعذّر تحميل سياسة السند` + `إعادة المحاولة`; the old `بانتظار تقييم سياسة المستند من الخادم` note was **absent** |
| C2 | Retry recovers | **PASS** | Keyboard-`Enter` on the focused retry button issued a genuinely new `…/policy [200]`; the full six-button action bar returned, byte-identical to the pre-failure baseline |
| C3 | Pending is still not an error | **PASS** | With `delay()` injected: pending note rendered, no error, no action bar — the fix did not collapse pending into failed |
| C4 | The failure is scoped | **PASS** | While policy failed: header, `بيانات السند`, `بنود السند`, attachments, and `سجل الحالة` all rendered; only the lifecycle card degraded |
| C5 | Idempotency key reuse | **PASS** | Attempt 1 (500) `Idempotency-Key: e56db77d-…`; attempt 2 (200) the **same** key; a later independent action minted a **different** key `c32aab62-…` |
| C6 | 409 shows Arabic guidance and refetches | **PASS** | 409 body carried **no** `detailAr`; toast showed the fallback `سند التسوية عدّله مستخدم آخر. أعد تحميل البيانات`; `POST [409]` was immediately followed by `GET /adjustments/… [200]` |
| C7 | No auto-retry, no optimistic state | **PASS** | Exactly one POST per click; status stayed `مسودة` after the 409 |
| C8 | Arabic / RTL / visual language | **PASS** | `dir="rtl"`, no mojibake, no reversed punctuation; the in-card `ErrorState` sits correctly beside the timeline, its `min-h-40` properly overriding the component's `min-h-64` |
| C9 | Keyboard + screen reader | **PASS** | Reached by `Tab` alone; visible double focus ring `box-shadow: … 0 0 0 2px …, 0 0 0 4px …`; container is `role="alert"` with `aria-labelledby` on the title |
| C10 | Responsive, no horizontal overflow | **PASS** | `scrollWidth <= innerWidth` at 1440 (1425/1440), 768 (753/768), 390 (390/390); error card uncut and button fully visible at 390 |
| C11 | Console cleanliness | **PASS** | Zero application errors or warnings. The only entries were Chromium's own `Failed to load resource` network lines for the deliberately injected 500/409 and the pre-existing seeded-adjustment 404 |

C6 is the check that specifically proves the dead-code bug is fixed: before
the fix, a 409 carrying no `detailAr` could never render the Arabic fallback,
so the toast would have been silently blank.

One pre-existing dev-mock defect was re-confirmed rather than introduced: the
seeded adjustment **list** rows are dead links because
`src/mocks/handlers.ts:2174` builds the list from three hardcoded rows while
`GET /adjustments/:adjustmentId` (`:2496`) serves only `getDb().createdAdjustments`.
That is already tracked as `eiams-frontend-14lp`.

## What this verification does NOT prove

MSW is a transport mock. Everything below is a **server** guarantee that no
browser test can observe, and none of it is claimed here.

- **Atomicity and rollback.** That a post writes its document, its stock
  movements, its asset movements, and any custody closure in a single
  transaction — and that a partial write rolls back — is enforced by the
  backend. A browser test can only show which requests the page issued. The
  same limitation is recorded verbatim in `docs/immutable-ledgers-audit-verification.md`
  ("Transaction / atomicity — that a post writes its document, stock movements,
  asset movements, and custody closure in one transaction is a server guarantee.
  No browser test can observe a rollback."). The F-2 test proves the browser
  sends a stable `Idempotency-Key` across a retry; it does **not** prove the
  server honours it, dedupes on it, or replays the original result.
- **Concurrency-token divergence is NOT addressed.** The frontend contract
  sends `rowVersion`; the real backend contract is understood to use
  `expectedRowVersion`. That mismatch is owned by beads `vi65` / `whhu` and was
  deliberately not touched here. This slice tests the `rowVersion` field name
  the frontend currently sends and asserts nothing about the backend's actual
  parameter name or its enforcement.
- **The real server's 409 semantics.** The suite decides what counts as a
  conflict by returning a contract-shaped `409` problem. Which situations the
  backend answers with `409` versus `403` or `422` is its decision. Following
  `docs/feature-service-composition-standard.md:87-91`, no generic helper
  assumes *why* a 409 happened: the recovery here is "refetch authoritative
  state and speak Arabic", which is correct for a stale row version, a state
  conflict, and an idempotency conflict alike.
- **Ambiguous-outcome dedup at the transport layer.** The F-2 lost-response
  case proves key *reuse*. Whether a lost response is genuinely ambiguous (the
  server committed but the reply never arrived) is asserted by the mock, not
  reproduced from a real network.
- **The `HttpResponse.error()` network path is MSW's**, not a real socket
  failure. It exercises axios's network-error branch, not kernel-level failure
  modes.
- **Retry counts are not production counts.** Tests build a `QueryClient` with
  `retry: false` for determinism; production `createQueryClient()` uses
  `retry: 1`, so a real failing policy read takes two attempts and about a
  second before it settles. The *behaviour* under test is the same, but the
  timing a user sees is not what the test clock shows.
- **Browser QA has since been performed** for this slice — see the *Browser QA*
  section above (11 checks, all PASS). An earlier revision of this file carried a
  "no browser QA was performed" bullet that contradicted its own QA table; the
  bullet was stale text from before the pass and has been corrected. The
  `ErrorState`-inside-`ContentCard` visual concern it raised is now resolved:
  the in-card rendering, the `min-h-40` override against the component's
  `min-h-64` default, the `role="alert"` announcement, the visible focus ring,
  and layout at 1440/768/390 were all confirmed on a rendered page.

## Deliberately not implemented

| Not implemented | Why |
| --- | --- |
| **412 / ETag / `If-Match` handling** | No contract in this repository declares it. Inventing a concurrency token mechanism would be exactly the "no new concurrency infrastructure" the design forbids. |
| **Any optimistic update (`onMutate` / `updateQueryData`)** | D-LIFE-01:279 rejected optimistic timeline appending; the repo's standing test forbids it on ledger keys; and D-LIFE-01 rule 5 forbids appending a guessed event. D-LIFE-01 rule 6's "discard optimistic UI state" is therefore vacuous here. |
| **Automatic retry of a stale Submit/Post** | `docs/feature-service-composition-standard.md:90-91` forbids it outright: a 409 may be a state, version, or idempotency conflict, and only the user can resolve which. Pinned by a test. |
| **A global Axios retry interceptor** | Explicitly forbidden by `docs/feature-service-composition-standard.md:100-101`. |
| **A new shared idempotency-context helper** | The two adjustment call sites need three lines each inside their own hook. A shared abstraction would have to encode a lifecycle the document page and the adjustment hooks structure differently, for no net gain. The `mutation-safety.ts` helpers were reused as-is. |
| **Changing `evaluateActionDecision` / the shared policy-gate function** | Its null-policy `Disabled` + `reasonAr: null` is the correct D-ATT-01 indeterminate behaviour. The bug was in the page collapsing two different states into one value. |
| **A policy-error surface on the adjustment detail page** | The adjustment detail page embeds its policy **inside** the detail read (`adjustment.policy`), so a failed adjustment read already produces one whole-page `ErrorState` with a retry. There is no second query to degrade independently — F-1 has no analogue there. This was checked, not assumed. |
| **Any other `policy={query.data ?? null}` degradation site** | A repository-wide search for that exact pattern returns exactly one match, the line fixed here. The `?? null` idiom in `use-document-policy-gate.ts:88` is the same *value* but is consumed by edit forms that gate on `policyGate.isLoading` / `preflight === null` themselves, and it is not a page rendering a dead action surface. |
| **Repairing the bead's truncated `design` field** | Reported, not silently rewritten — the bead is the human owner's record, and this task is not authorised to alter it. |
| **Touching the pre-existing 5 ESLint warnings** | Explicitly out of scope; the baseline is tracked separately (bead `j90m`). |

## Change log

- `src/shared/documents/pages/document-detail-page.tsx` — F-1: `policyFailure`
  derived from `policyQuery.isError`, a `useCallback` retry that refetches the
  policy, a new optional `policyFailure` prop on `DocumentDetailBody`, and an
  `ErrorState` + `Button variant="outline" size="sm"` retry replacing the
  action surface on a failed policy read. `evaluateActionDecision` untouched.
- `src/modules/adjustment/hooks/use-adjustment-actions.ts` — F-2: one
  `useRef`-held `IdempotencyKey` per action, minted on first execution, kept on
  failure, cleared in `onSuccess`. F-3: `useInvalidateAdjustmentScope()` on a
  409, and the `detailAr !== undefined` → `!== null` guard correction that
  makes the Arabic conflict guidance reachable. Module comment rewritten to
  match the code.
- `src/test/concurrency-partial-failure.test.tsx` — **new**, 8 cases. Five
  prove the defects (all confirmed failing against the pre-fix code via
  `git stash`); three are verify-only guards on already-correct behaviour.
