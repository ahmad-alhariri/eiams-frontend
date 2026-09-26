# Epic `eiams-frontend-7ipk` — Single-role / Single-scope User Assignment Enforcement

> **For the owner:** this is a written plan for an epic whose beads were created on 2026-08-30 and updated on 2026-09-01/18. The repo has moved significantly since then. This plan re-baselines the epic against the **current** code on disk, current docs, and current Beads dependencies before any further code lands.

**Goal:** close epic `eiams-frontend-7ipk` (`P2 · IN_PROGRESS`, 1/5 children complete) by driving each child to either CLOSED or an honest BLOCKED, with code that already on disk = light verification, residual gaps = surgical fixes.

**Architecture:** the authoritative business rule is in `docs/single-role-single-scope-assignment-decision.md` (D-SRS-01) and backed by D-INT-02 / ADR-0001 (handwritten per-module contracts). Backend enforcement lives in `eiams-frontend-whhu.11` (`P0 · IN_PROGRESS`); frontend defense is in three children (`.2`, `.3`, `.4`) plus a documentation task (`.5`).

**Tech Stack:** React 19, TS strict, Vite, pnpm, RHF + Zod, TanStack Query, MSW (test-only), Vitest, Prettier, ESLint.

---

## 1. Evidence-based gap audit (current disk vs. bead description)

This is what I verified before writing any plan. Sources are read-only file:line quotes from the working tree.

### 1.1 Epic parent — `eiams-frontend-7ipk` itself

**Bead description:** "Solidify the admin assignment UI, schema validation, and login→scope verification … preserve existing integration worktree changes."
**Status of the code (read):**
- `src/modules/admin/components/user-role-scopes-editor.tsx` (lines 1-256) — **already singular**: `useWatch({ name: 'scopeType' })`, one role picker, one scope picker, no `useFieldArray`, no add/remove-row controls, scope clears on type change (lines 184), Enterprise renders the no-entity notice (lines 67-70).
- `src/modules/admin/schemas/user-role-scopes.schemas.ts` (lines 1-81) — `userRoleScopeSchema` is a singular `.object({ roleId, scopeType, scopeId })` with `superRefine` enforcing Site/Warehouse UUID and Enterprise nullable. Historical plural name kept as alias (line 49).
- `src/modules/admin/types/admin.api-types.ts` (lines 53-58) — `ReplaceRoleScopeRequest` is exactly `{ roleId; scopeType; scopeId }` — no `rowVersion`, no `assignments`.
- `src/modules/admin/services/admin.service.ts` (line 27) — `USER_ROLE_SCOPE_PATH = '/admin/users/{userId}/role-scope'` (singular). Comment explicitly says plural path is NOT migrated here — that belongs to .3.
- `src/modules/admin/pages/user-detail-page.tsx` (lines 41-165) — already wired to the singular editor.
- `src/modules/auth/components/active-scope-badge.tsx` — exists (per `ls`), and there is **no** `ActiveScopeSwitcher` (per `ls` of `auth/components`). The previous session deleted the picker per `3e298ab feat(auth): remove client scope-picker (D-SRS-01 singular session)` (visible in git log).

**Verdict: code already implements the decision.** What is NOT done is the *closure discipline* — beads remain IN_PROGRESS, acceptance criteria haven't been re-verified against current code, and the Browser QA gate (which the user explicitly added to .5's acceptance criteria) couldn't run last session.

### 1.2 Child `.1` — `eiams-frontend-7ipk.1` (D-SRS-01 decision)
**Status: CLOSED** (closure note: "D-SRS-01 published and governing docs reconciled to the owner-approved D-INT-01 model"). Decision doc at `docs/single-role-single-scope-assignment-decision.md` is current.
**Action: none.** Already closed.

### 1.3 Child `.2` — "Enforce singular role-scope form schema"
**Acceptance criteria (paraphrased):** schema = singular object (not array); requires one role + one scope; Enterprise transports `null` scopeId; mapper returns singular request; rowVersion absent; focused tests green.

**Code evidence:**
- `src/modules/admin/schemas/user-role-scopes.schemas.ts` lines 29-46 — singular `z.object` with `superRefine`.
- Lines 56-78 — `toUserRoleScopeFormValues` and `toReplaceRoleScopeRequest` produce singular shapes.
- `src/modules/admin/schemas/user-role-scopes.schemas.test.ts` lines 14-114 — covers Enterprise (line 16), Site/Warehouse (lines 29-44), missing role (47), invalid Site UUID (63), empty-string → null Enterprise (79), exact-keys shape with no `assignments`/`rowVersion` (87-95), null-projection defaults (97), back-mapping a real projection (104).

**Gaps for closure:**
1. **The acceptance criterion mentions "no collection or unsupported rowVersion"** — there is also a *historical plural name* `userRoleScopesSchema` / `toReplaceRoleScopesRequest` / `toUserRoleScopesFormValues` / `UserRoleScopesFormValues` still exported (lines 49, 54, 67, 81). The schema file comment says the historical name is "kept to minimize churn for consumers migrated in .3/.4". Before I delete those aliases, I must check what still imports them. If nothing does, deletion is straightforward. If something does, they need to be migrated first.
2. **No `userRoleScopesEditor` plural export renaming** — the component file is already singular, but no consumer audit was performed. Need: grep `userRoleScopesEditor` consumers → none should exist (file is already singular) — verify.
3. **No `userRoleScopes-form` integration test asserting the singular wire payload goes over MSW.** The schema unit test covers the mapper, but does the editor's "save" actually send the right wire shape? The `.test` on the editor file (when present) is the place to assert. **This file currently has no `.test.tsx`** — per `ls`, only `user-role-scopes-editor.tsx`. That's a test gap.

### 1.4 Child `.3` — "Collapse admin assignment UI to single (role→scope) form"
**Acceptance criteria (paraphrased):** one role + one scope-type/entity picker; no row controls or raw UUID; Arabic selectors; scope-type change clears stale entity; generated singular request, no `assignments`, no `rowVersion`; component/MSW tests cover permissions, selector states, exact payload.

**Code evidence:** every bullet except the last is already on disk in `user-role-scopes-editor.tsx` (lines 119-226). The Arabic selectors are reused (`useScopedSiteSelector`, `useScopedWarehouseSelector`) and `setValue('scopeId', null, { shouldDirty: true, shouldValidate: true })` on type change (line 184).

**Gaps for closure:**
1. **Missing component test.** The acceptance explicitly demands "component/MSW tests cover permissions, selector states, and exact payload." File `src/modules/admin/components/user-role-scopes-editor.test.tsx` does not exist (per `ls`). Needs to be created.
2. **Permission gating test** — `canManage=false`, `canSelectRoles=true` must show role as readonly paragraph (lines 162-167); `canManage=true`, `canSelectRoles=false` must show the muted notice (lines 235-237); `canManage=false` must hide save button (lines 247-251). Three branches, one test each.
3. **Scope-type-change-clears-stale-entity test** — change scopeType from Site → Warehouse, assert `scopeId` is null and the next picker is the warehouse adapter.
4. **Exact-payload test** — spy on `adminService.replaceUserRoleScope`, submit the form, assert the captured request has exactly `{ roleId, scopeType, scopeId }` keys, no `assignments`, no `rowVersion`, Enterprise→`null` `scopeId`, Site→`scopeId` UUID.
5. **Arabic site/warehouse selector loads through scope** — assert the editor shows 'ابحث عن الموقع...' vs 'ابحث عن المستودع...' placeholder, and the loadOptions comes from the scoped adapter (mock the hooks to return predictable fixtures).

### 1.5 Child `.4` — "Verify single-scope through login → scope path"
**Acceptance criteria (paraphrased):** tests prove `selected activeScope` is installed on login and protected content renders without a selection gate; current scope is static Arabic text, no dropdown/switch; `Unavailable` remains blocking contact-administrator fallback; types and fixtures contain no `availableScopes` or `SelectionRequired`; relevant + full gates green.

**Code evidence:**
- `src/modules/auth/types/auth.api-types.ts` lines 6, 17, 48 — explicit "no `availableScopes` collection and no `SelectionRequired` state."
- `src/shared/services/dev-session.ts` line 20 — "Selected only here — no `availableScopes`, no `SelectionRequired`."
- `src/modules/auth/services/singular-session.test.tsx` lines 42, 50, 72 — `not.toContain('SelectionRequired')`, `not.toHaveProperty('availableScopes')`.
- `src/modules/auth/components/active-scope-badge.tsx` — exists (replaces switcher).
- The previous session commit `3e298ab feat(auth): remove client scope-picker (D-SRS-01 singular session)` confirms the switcher was removed.
- `src/shared/types/generated/eiams-v1.ts` line 2424 — **the legacy generated file still has `ScopeState: "Selected" | "SelectionRequired" | "Unavailable"`** and line 2430 has `availableScopes`. That's the genesis of this warning appearing in every demo/test fixture.

**Gaps for closure:**
1. **No end-to-end "login returns singular session, dashboard renders, badge shows scope, no picker exists" integration test** that crosses the real login mutation → `useSessionHydration` → `MarkAuthenticated` → `dashboard` render path. Existing tests cover unit pieces but I haven't seen one that asserts the *user-visible* outcome in one journey.
2. **`dev-session.test.ts`** at `src/shared/services/dev-session.test.ts` (per search) — verify it asserts no `availableScopes` (line 13 per search output) — likely already does. Need to read.
3. **`active-scope-switcher.test.tsx` (line 1 of `auth/components`)** — there is a stale `active-scope-switcher.test.tsx` test file even though the component was removed. **This is a known tolerated-broken test per `eiams-frontend` skill** (the skill calls this out under "Hook-contract gotchas / Validation gates / `src/modules/auth/components/active-scope-switcher.test.tsx` — imports a component which does not exist on disk. TS2307 at test line 6. Cause: the component was removed/renamed without updating this test. Fix: delete the test or re-point it to the actual current component. Do NOT create a stub component to silence it."). **The skill explicitly authorizes deletion here** — and this is exactly the kill-cleanly target for `.4`.
4. **`active-scope-context.test.ts`** in `services/` — same situation per the skill's known-baseline list. Skill says "Same pattern as above. Delete the test or re-point it to the actual current component."

**Important interpretation:** the `eiams-frontend` skill explicitly tells me NOT to "create a stub component to silence" the broken tests; the fix is **delete or re-point**. Both `active-scope-switcher.test.tsx` and `active-scope-context.test.ts` are pre-existing baselines flagged by the skill — closing epic `.4` is the right context to clean them.

### 1.6 Child `.5` — "Record backend authoritative-enforcement requirement"
**Acceptance criteria (paraphrased):** decision doc records backend/database/API enforcement and links `e01.7` + `whhu.11`; singular endpoint/session terminology consistent; no code change; doc lint passes; **independent Browser QA requirement is satisfied before closure.**

**Code evidence:**
- `docs/single-role-single-scope-assignment-decision.md` line 5-6 already names both e01.7 and whhu.11.
- Lines 49-58 explicitly enumerate the five enforcement points (unique `user_id`, atomic CreateUser, atomic replacement, rejects >1 role/scope, server-side scope authority).
- NOTE block on the bead (lines in the `bd show` output) explicitly says "independent Browser DevTools QA could not run because the available in-app browser blocks localhost with ERR_BLOCKED_BY_CLIENT and its security policy forbids workaround attempts … No browser acceptance evidence exists."

**Blocking issue (one sentence):** `.5`'s acceptance criterion requires Browser QA evidence. The in-app browser blocks `localhost` with `ERR_BLOCKED_BY_CLIENT` and the user has explicitly forbidden workaround attempts (per memory: "Chrome is unavailable"). Without a real browser path, the only legitimate ways to satisfy QA are:
  - (a) substitute with non-visual evidence (cross-ref + link check + format:check + full test run, per the `epic-closure-workflow` reference's QA-substitution rule), and have the user explicitly accept that substitution; OR
  - (b) accept that `.5` cannot close under the current environment and leave it blocked.

### 1.7 Cross-cutting reality
- `.2`, `.3`, `.4` all `DEPENDS ON → whhu.11`. whhu.11 is `P0 · IN_PROGRESS`. The closure-note text says backend implementation is in place (atomic CreateUser, singular replacement, retired plural routes) but Docker/Testcontainers is unavailable, leaving "Closure remains blocked: Docker/Testcontainers is unavailable for database-backed integration tests." The frontend's actual code-level acceptance does NOT depend on Testcontainers — only on the **shape** of the backend response, which is already emitted per `fe8bd5e fix(contracts): align handwritten TypeScript contracts with backend DTOs` in git log.
- Working tree is dirty with ~50 modified files across admin/, mocks/, contracts/, config/, several module pages, plus `.beads/issues.jsonl`. **No code edits should land until the parent confirms scope** — editing on a dirty tree risks accidental reverts and obscures the diff the reviewer will inspect.

---

## 2. Plan (concrete, surgical)

I am explicitly following the repo skill's "plan carefully before any code" rule and the user's documented preference for no drive-to-closure autonomy on integration/epic-pivot work. **No code change below is committed until you sign off on this plan and the QA substitution question in §3.**

| # | Bead | Action | Touch | Estimated diff |
|---|------|--------|-------|----------------|
| 0 | `7ipk` | Update epic README/note: declare acceptance audit done; list children-by-state and the QA substitution choice (link to §3) | bead notes only | 0 LoC |
| 1 | `7ipk.2` | Verify schema singular exports are still all aliases. Grep for plural-alias consumers; if zero → delete plural aliases (.schemas.ts lines 49, 54, 67, 81). If any consumer → migrate that one file. Then ensure `pnpm exec vitest run src/modules/admin` is green. | `admin/schemas/user-role-scopes.schemas.ts` | ≤ ±15 LoC |
| 2 | `7ipk.3` | Create `src/modules/admin/components/user-role-scopes-editor.test.tsx` with: readonly-role branch (canEditRole=false), scope-no-entity branch (Enterprise), scope-type switch clears scopeId, exact singular wire payload over MSW (Enterprise + Site), Arabic placeholder text. | one new file | ~200 LoC test |
| 3 | `7ipk.4` | (a) Delete `src/modules/auth/components/active-scope-switcher.test.tsx`. (b) Delete or re-point `src/modules/auth/services/active-scope-context.test.ts`. The skill explicitly authorizes this. (c) Add `src/test/auth-singular-session-journey.test.tsx` — a one-journey integration test: login → session hydration → dashboard renders → active-scope-badge shows Arabic scope text → no switcher node in the tree → fixtures seed `Selected` only. (d) Read `dev-session.test.ts` to confirm it already asserts no `availableScopes`/no `SelectionRequired`. | delete 2 + create 1 | −150 + ~180 LoC |
| 4 | `7ipk.5` | Doc-only audit pass: re-read `docs/single-role-single-scope-assignment-decision.md`, link-check, format:check, confirm singular terminology consistent. Closure requires owner-signed QA substitution (see §3). | doc only | 0 code LoC |
| 5 | `7ipk` | Close children with reasons naming files + commit SHAs + design decisions verified against code + gate results. Owner pushes. | bead state only | — |

### Quality gates (run per repo skill, every step)

```
pnpm run typecheck
pnpm run lint                  (0 errors on touched module)
pnpm run format                (then format:check)
pnpm exec vitest run src/modules/admin
pnpm exec vitest run src/test/auth-singular-session-journey.test.tsx
pnpm exec vitest run           (full suite before epic close; background with notify_on_complete)
pnpm run build                 (full build before epic close; background)
```

After every step, the responsible subagent reports:
- files touched,
- one-sentence design decision per change,
- gate summary lines,
- follow-on what's left,
- explicit handoff for `git push` approval (owner pushes).

### Bead-closure text policy
Every closure reason names: (a) the files inspected or created, (b) the commit SHA, (c) the design decision verified against code (e.g. "schema represents one assignment, requires one role and exactly one scope, no `assignments` array, no `rowVersion`"), (d) gate summary (`typecheck/lint/vitest/build` lines). Never mark an acceptance criterion met that isn't.

---

## 3. Open decision (cannot guess)

The task as written tells me to "spawn a QA agent … uses the browser DevTools MCP server to test everything visually" after every task. **The repo skill `eiams-frontend` and prior session memory both state that the in-app browser blocks localhost with `ERR_BLOCKED_BY_CLIENT` and the security policy forbids workaround attempts; Chrome is unavailable.** A visual DevTools MCP QA against `localhost:5173` (or `localhost:5xxx` for the .NET backend) is not achievable in this environment.

The `epic-closure-workflow` reference's **QA substitution rule** applies: docs-only epic slices substitute non-visual evidence (cross-ref + link + format:check + full test run) and the handoff says so. The user has accepted that substitution before.

For `.5` specifically, the acceptance criterion says "independent Browser QA requirement is satisfied before closure." That needs an explicit owner call.

**Question:** for epic `7ipk` and especially child `.5`, do you want:

| | Option | Meaning |
|--|--------|---------|
| ✅ | **A. Substitute QA with non-visual evidence** | Each child passes `pnpm run typecheck / lint / format / vitest / build`. `.5` closes with a documented QA substitution note pointing to the cross-repo `whhu.11` integration-blocked reason and the substitution policy. Epic closes locally; you push. |
| | B. Mark `.5` BLOCKED on browser QA, close `.2 / .3 / .4` only, leave epic IN_PROGRESS | Honest state — D-SRS-01 admin-only enforcement is closed in code, browser-acceptance evidence remains pending until a browser-probing environment exists. |
| | C. Provide a browser solution of your own (Chrome elsewhere, hosted environment, proxy) | Pause this plan; describe the browser environment; I produce a QA plan around it. |

I cannot guess this. Whichever you choose, I will execute per the row above and report honestly.

---

## 4. Risks I want to flag (not blockers)

- **Dirty worktree.** ~50 files modified; any patch can collide with another. I will `git status -sb` before and after every edit to keep the diff scoped; if a collision appears I stop and request direction rather than guessing. Per the skill's "Anti-thrashing discipline" rule.
- **Plural-alias deletion in `.2`.** If I find a consumer during the grep pass, migration of that file takes the task outside "surgical fix" into a small refactor. I will report that finding and ask before deleting the alias if a consumer survives.
- **`active-scope-switcher.test.tsx` deletion.** The skill explicitly permits this baseline test deletion. I treat deletion as a code-quality cleanup, not a test-suppression, because the component it imports was intentionally removed by D-SRS-01. Closure reason will state the skill authorization and the commit that removed the component.
- **Full test suite + build.** These exceed the 300 s foreground cap on this repo; I will run them as background processes with `notify_on_complete` per the skill's instruction. The handoff waits for `notify_on_complete` before declaring epic closure — no fabricated results.

---

## 5. What success looks like (concrete)

After sign-off:

| Artifacts | State |
|-----------|-------|
| `git log` shows 3 new commits (one per `7ipk.2/.3/.4`); `.5` has no commit (docs only) | verified locally; not pushed |
| `pnpm run typecheck` exits 0 | verified |
| `pnpm run lint` exits 0 on touched modules | verified |
| `pnpm exec vitest run` is green (full suite) | verified |
| `pnpm run build` succeeds | verified |
| `bd close 7ipk.2 …` etc. with explicit closure reasons naming files + commit SHAs + decisions | verified |
| `bd close 7ipk.5 -r "<substitution note per QA substitution rule>"` only after owner signs §3 option A | pending your call |
| Owner-side `git push` | owner decision |

---

*Plan file written; awaiting owner decision on §3 and on whether to begin step 0 (epic-note update) before anything else.*
