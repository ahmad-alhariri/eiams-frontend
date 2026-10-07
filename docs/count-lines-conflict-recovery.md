# Count-line save: conflict recovery and honest reporting — `eiams-frontend-3wv1`

Closes the frontend half of a gap that had been visible for a while and
untracked for longer. The endpoint question is **not** settled here; that is
`eiams-frontend-9d0r` and it needs the Backend/API owner.

## The premise this task was filed under was wrong

The original bead asked whether `PUT /inventory-counts/{countId}/lines` applies
partially or all-or-nothing, because a `409` carries no per-line attribution.
**A Human-Owner-approved ruling already answered it**, and the frontend simply
never adopted it:

`C:\EIAMS-SYSTEM\docs\integration\conflict-resolution.md:3220` — RESOLUTION-025
"Semantic count actuals with authoritative results", APPROVED, Human Owner
2026-09-09:

- `:3284` "Every supplied actual is validated before writing; **the batch commits
  completely or changes nothing.**"
- `:3285` "A successful batch increments the count row version once regardless of
  the number of affected lines."
- `:3279` the request carries only `lineId` + exact `actualQuantity` + aggregate
  `expectedRowVersion` — **no per-line version at all**.
- `:3319` the semantic `/actuals` command **replaces writable `/lines`**, and
  `:3347` "Implementation status: NOT IMPLEMENTED".

`CONFLICT-020` in `conflict-register.md:1563-1631` is RESOLVED / DECIDED.

So this is **non-adoption of an approved resolution**, not a missing ruling.
Three further facts are why `/lines` cannot simply be patched:

- the real backend contract has **no `PUT .../lines`** at all (that path is
  GET-only there);
- its line response has **no `rowVersion`**, so the per-line token the frontend
  invents does not exist server-side;
- `/lines` is the only count mutation in the frontend contract that accepts **no
  `Idempotency-Key`**, while sibling `/start`, `/complete` and `/close` all do —
  so an ambiguous `409` can never be made retry-safe on this operation.

## The hazard that shaped every decision here

The workspace feeds the loaded page to react-hook-form through the `values`
prop. From `node_modules/react-hook-form/dist/index.esm.mjs`:

```js
React.useEffect(() => {
  if (props.values && !deepEqual(props.values, _values.current)) {
    control._reset(props.values, { keepFieldsRef: true, ...control._options.resetOptions })
  }
}, [...])
```

Any refetch that changes the loaded lines therefore **resets the form and
discards every quantity the operator typed**. Today the entries survive a failed
save only because `useUpdateCountLinesMutation` has no `onError` — the absence
was load-bearing but entirely accidental and undocumented.

So the first proposed remedy for this bead ("add an `onError` that refetches
authoritative state") **would have introduced the data loss the bead exists to
prevent.** The mutation's docstring now records this in place, and the workspace
carries a warning against the obvious "fix":

> DO NOT add `resetOptions: { keepDirtyValues: true }`. Drafts are keyed by row
> INDEX, so keeping dirty values across a reseed would carry page 1's quantities
> onto page 2's rows.

Drafts are protected on the failure path by **not invalidating at all**, not by
weakening that reset.

## What changed

### 1. A neutral conflict recovery, mirroring the document feature

`useUpdateCountLinesMutation` keeps its error path free of invalidation. A
`409` is caught at the call boundary with the previously-dead
`isConflictError` (`mutation-safety.ts:63` had no production call site) and handed
to a new `useCountConflictRecovery`, which offers exactly two honest choices:
load the authoritative count and lines, or stay and keep what you have.

Neither the hook nor the dialog claims the save was or was not applied. It
cannot: the response carries no per-line attribution, so "3 of 5 lines were
saved" would be a fabricated fact. The dialog copy says so explicitly — *الرد لا
يوضّح أي البنود حُفظت*.

The batch is **never retried automatically**: `feature-service-composition-standard.md:90-91`
forbids it, and without `Idempotency-Key` it could not be made safe.

`recover()` uses `Promise.allSettled` and never rejects, so a failed refetch
cannot strand the dialog in a permanent busy state. `dismiss()` deliberately
does not refetch, and the resulting trade-off — the visible rows may still be
behind the server, so a further save can conflict again — is documented on the
hook.

### 2. One shared dialog instead of two

The neutral dialog structure, its focus contract and its "asserts nothing"
semantics lived in `shared/documents/document-conflict-dialog.tsx`. The count
workspace needs the same affordance, so they were extracted to
`src/shared/ui/conflict-recovery-dialog.tsx`, and the document file is now a
thin binding to its own Arabic copy. Its existing tests pass unchanged, which is
the evidence that the extraction was behaviour-preserving.

### 3. A save plan that reports what it cannot send

`toCountLineUpdateRequest` is **deleted**, replaced by `planCountLineSaves`,
which returns the batch *and* the changed rows it cannot carry. It was the only
caller-visible difference that mattered, and leaving the old function would have
left a second batch builder in the file — with its defect intact and, worse, a
test asserting the defect.

Two silent failures are now explicit:

- **A changed row with a blank or unparseable quantity was dropped** while still
  counting toward `dirtyCount`. The page could therefore report a successful save
  and then go on claiming unsaved changes. With up to 100 rows per page, an
  operator could have up to 100 such rows in silence.
- **A line with no `rowVersion` was sent as `0`.** `UpdateCountLineInput.rowVersion`
  declares `"minimum": 1`, so that payload could only ever draw a `422`. The
  previous test `defaults a missing line rowVersion to 0` was pinning the
  defect; it is replaced by a case asserting the row is *blocked*, plus a
  belt-and-braces check that nothing in the batch carries a sub-minimum version.

The workspace derives the plan from the live drafts, so the save button label,
the blocked-row warning and the batch the handler builds are all one
computation — they cannot drift apart, which is how they disagreed before.

### 4. The remedy that destroyed the work

The inline failure message said *"تعذّر حفظ بنود الجرد. تحقق من عدم وجود جلسة أخرى
أو حدّث الصفحة."* — **a page refresh is the single action that discards every
unsaved draft, with no guard.** It now says the entries were not lost and can be
retried.

## The regression test that nearly was not

The acceptance criterion required a test that **fails** if the invalidation is
reintroduced. The first version of it did not.

Verified: with `onError: invalidate` temporarily added back, all 20 tests still
passed. The fixture's `GET` returned identical data, and react-hook-form's
`values` reset short-circuits on `deepEqual` — so no reset ever fired and the
draft-preservation assertions proved nothing.

The fixture now shifts the server's rows on the `409`, which is both realistic (a
conflict means the server's state has moved on) and what makes the assertions
discriminating. Re-verified: reintroducing `onError: invalidate` fails exactly
the two draft-preservation cases; removing it passes all 20. The reason is
recorded in a comment on the case, so the next person does not "simplify" the
fixture back into a vacuous test.

## Browser QA, and the two defects it found in my own work

First pass, independent Chrome DevTools MCP, 7 PASS / 0 FAIL, mock instrumented
then fully reverted (empty `git diff` on it). Confirmed: a blocked row produces
the Arabic `role="alert"` with the save button disabled and no success claim; a
cleared quantity is reported the same way; an ordinary save still succeeds and
reseeds cleanly; a `409` keeps every typed entry with the dialog showing and
**exactly one** PUT; the dialog asserts nothing about which rows saved; focus is
trapped and Escape works; declining the reload keeps the entries and issues no
refetch, while accepting it refetches both endpoints and replaces the values;
the 500 copy no longer advises a page refresh; RTL and no overflow with the
dialog open; 0 application console errors.

It also found two defects in what I had just written.

### D1 (HIGH) — the honest warning was honest only until the next save

On a page mixing a sendable row and a blocked one, the warning was correct… and
then the next **successful** save erased the blocked row's entry, because the
reseed adopted the server's *unchanged* value for it — and the page then
reported **لا تغييرات غير محفوظة.** The UI was asserting an entry was saved when
it had neither been sent nor retained. Same defect class as the bead, one step
later than C1 and C2 could reach, since those never save.

The first fix was wrong twice over. `form.reset(baseline, { keepDirtyValues:
true })` on the save path did nothing, because the `values` prop fires its **own
full** reset the moment the refetch lands — before the explicit call. The fix had
to remove the conflation at its source:

- the `values` prop is **gone**. It cannot distinguish a background refetch, a
  post-save reseed and a page change, and it resets fully for all three.
- reseeding is an explicit `useEffect` using `keepDirtyValues`, so an entry that
  could not be sent stays dirty, stays reported, and is offered in the next save;
- page navigation clears the form **before** changing the page, so index-keyed
  drafts cannot leak onto the next page's rows.

The test for D1 is verified non-vacuous: removing `keepDirtyValues` from the
effect fails exactly that case.

### D2 (MEDIUM) — the toast still told the operator to do the one thing that loses their work

`api-error.ts:65` answers a 409 whose body is not contract-shaped with
*"تغيرت البيانات. حدّث الصفحة ثم حاول مجدداً."* A page refresh discards every
entry, unguarded — and it appeared **simultaneously** with the dialog whose whole
point is that the entries are still there. The bead had removed that advice from
the inline message and missed it in the toast.

Fixed by not routing the save through `useSubmitFeedback`: a conflict is reported
only by the recovery dialog, and any other failure is toasted with
`normalizeApiError` in the same shape the shared helper uses. Changing the shared
409 copy instead would have altered every conflict surface in the app for a
problem that is specific to a form holding unsaved work.

Both fixes re-verified in the browser: the blocked input still holds its value
after a successful save with the warning intact and `حفظ (٠)` disabled; a
non-contract 409 shows the dialog with **zero** occurrences of `حدّث الصفحة`, the
entries intact and one PUT; an ordinary save still reseeds clean; a 500 still
shows the inline alert without refresh advice; and page 2 does not inherit page
1's quantity.

## What this does NOT prove

- **Whether the batch applied.** A `409` does not say, the contract carries no
  per-line channel, and no frontend test can observe a server transaction. The
  dialog therefore asserts nothing. Proving all-or-nothing application would
  require the server's own test suite.
- **That recovery is safe under every ruling.** It refetches only when the
  operator asks, so it is neutral, but it cannot tell them what changed.
- **Endpoint correctness.** `/lines` is slated for replacement by `/actuals` per
  RESOLUTION-025; everything here is correct against a contract that is on its
  way out. See `eiams-frontend-9d0r`.
- **The `['public', …]` fallback key.** The workspace's no-scope key remains
  unpopulated because the query stays disabled; unchanged from before.

## Change log

- `src/modules/inventory-count/schemas/count-line-entry.schemas.ts` —
  `toCountLineUpdateRequest` replaced by `planCountLineSaves`, returning
  `{ request, blocked }`; `CountLineSaveBlock` added; the `rowVersion: 0` path
  removed.
- `src/modules/inventory-count/schemas/count-line-entry.schemas.test.ts` —
  migrated to the plan function; the defect-pinning case replaced; cases added
  for blank quantity, mixed sendable/blocked, and the sub-minimum guard.
- `src/modules/inventory-count/hooks/use-count-queries.ts` — docstring recording
  why there is no `onError` invalidation.
- `src/modules/inventory-count/hooks/use-count-conflict-recovery.ts` — **new**.
- `src/modules/inventory-count/components/count-quantity-workspace.tsx` — plan
  derived from live drafts; blocked-row warning; honest save label; conflict
  dialog; non-destructive failure copy; the `values` prop removed in favour of an
  explicit `keepDirtyValues` reseed effect plus a pre-navigation clear; a conflict
  no longer double-reported through the shared toast.
- `src/modules/inventory-count/components/count-quantity-workspace.test.tsx` —
  conflict-recovery and save-plan suite (8 cases) plus the count-detail handler
  the workspace now needs; the conflict fixture made discriminating.
  now needs; the fixture made discriminating.
- `src/shared/ui/conflict-recovery-dialog.tsx` — **new** shared primitive.
- `src/shared/documents/document-conflict-dialog.tsx` — now a binding of it.

Gates: see the close reason for the full result.
