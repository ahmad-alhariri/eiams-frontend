# Enforcing the feature-service composition standard — `eiams-frontend-xlfs`

Turns `docs/feature-service-composition-standard.md` from a document nothing
enforced into one that fails the build.

## What the old guard actually did

`src/test/feature-service-composition-standard.test.ts` asserted that the
standard's **documentation** still contained certain sentences, and that three
modules still exported certain names. It inspected no service, hook or page.

It would have passed unchanged with every service in the repository violating
every rule in the standard. Two of its assertions were worse than weak: they
pinned `createIdempotentRequest` as a required export and as required
documentation — and that helper had **zero production call sites**, so the test
was actively protecting dead code.

The mechanism that let this happen is worth naming: the class of bug the epic
shipped four times was "a secondary read failed and the UI stated something it
had no basis to state", and a standard nobody could violate was part of why it
kept recurring.

## The split, and why

A source scan is a poor guard for a single-token rule: its error messages are
hand-built, it runs after a full build, and it re-implements directory walking
that ESLint already does. It is a **good** guard for a rule that needs either
cross-file knowledge or an **absence** check, neither of which
`no-restricted-syntax` can express. So the rules were divided by capability
rather than by tool.

### Phase 1 — ESLint, lands green

`eslint.config.js` gained a block scoped to the contract-only service set: every
`*.service.ts` under a module's `services` directory plus the three shared
transports — **16 files**. It adds `no-restricted-imports` for TanStack Query,
Zustand, React and the toast manager, and `no-restricted-syntax` for
`axios.create`, raw `fetch`, `.interceptors`, `new QueryClient`, cache writes and
invalidation, `normalizeApiError`/`isConflictError`, `useNavigate`/`usePermission`,
and a literal `'Idempotency-Key'`.

Measured before landing: **0 violations across all 16 files** for every rule, so
this phase is a pure regression fence. It is a fence rather than a formality:
these are exactly the imports a service acquires casually while "just fixing" a
feature.

**The file globs are deliberately narrow, and that is load-bearing.** A
`src/modules/**/services/**` glob also matches `auth/session-lifecycle.ts` and
`auth/active-scope-context.ts`, which legitimately own the QueryClient and the
auth session key the standard explicitly assigns to the auth module — two false
positives on day one. The `*.service.ts` convention is what makes the scope
exact, and is a reason to keep that naming.

### Phase 2 — the real violations, fixed

Three groups, all found by measurement rather than assumed:

- **`count.service.ts`** was the only service in the repository interpolating a
  path parameter without `encodeURIComponent`; every other one routes through a
  `pathWithId` helper. It also had six bare path constants with no
  `satisfies keyof paths`, so TypeScript never checked a single one. Both fixed.
- **`adjustment.service.ts`** had five bare path constants for the same reason.
  Fixed.
- **`use-external-party-mutations.ts`** defined a local `createIdempotencyKey`
  shadowing the shared export and hand-built the header at the call site — which
  the standard forbids **by name** ("Never call fetch directly or add a
  feature-local interceptor/header"). The service now takes a plain key and
  attaches the header with `withIdempotencyKey`, so the transport owns it.

`pathWithId` itself existed as **eight** identical three-line copies, one per
service, and `count.service.ts` was about to become the ninth. It is now
`src/shared/services/api-path.ts`. The eight remaining local copies are
mechanical and recorded in `eiams-frontend-85dy` rather than rewritten here.

### Phase 3 — the three scans

`src/test/feature-service-composition-standard-scans.test.ts`, built on
`src/test/support/source-scan.ts` — hoisted out of `immutable-ledgers-audit.test.tsx`
so the repo has one way to scan source instead of a third style.

1. **Query keys come from a factory.** The shape checked is the *mistake*, not
   the correct shape, so the rule cannot itself go stale when `scopeParts`
   changes. This class is a silent correctness hazard, not a style nit: keys
   built by hand are invisible to `clearScopedQueries` and to the module's own
   invalidation. `eiams-frontend-jkel` is exactly this bug.
2. **A failed secondary read stays distinguishable.** The defect class this
   workstream shipped four times. A bare `?? null` scan is useless — 172 hits, no
   discriminating power — so the check correlates the collapse with the
   **absence** of an error branch for the *same query variable*. File-scoped
   correlation would false-positive on any file holding two components.
3. **An idempotency key is minted once per user intent.** Deliberately **not**
   "createIdempotencyKey inside mutationFn": that shape flags the three *best*
   implementations in the repository, which mint inside the mutation and hold the
   result in a `useRef`. The detector distinguishes a key that is *owned* from one
   passed as a bare argument.

All three landed only after the violations they report were fixed — four
hand-derived query keys and five unsafe key mints. Landing a red scan to "raise
awareness" is how a guard dies.

## Non-vacuity, which is the whole point

A source scan that matches nothing is indistinguishable from a source scan that
is broken. Four devices, each verified by deliberately breaking the thing it
guards:

1. **Exact file-count assertion** per scan, not `> 0`. A narrowed glob usually
   leaves a handful of files rather than none, and `> 0` waves that through.
2. **A negative control per scan**, running a known-bad snippet through the
   detector at the moment the suite executes. This caught a real flaw: the
   control for scan 3 had its own simplified copy of the logic and had drifted
   from the implementation. Both now go through one function — a control that
   exercises different code than production proves nothing about the detector.
3. **Repo-relative offender lists**, so a failure names the file rather than
   printing a blob of source.
4. **The `standard-allow` escape hatch, verified to work.** It had zero users, so
   its tests were trivially green. Planting a violation with a marker above it
   kept the scan green; removing the marker turned it red naming `file:line`.
   That check also found a genuine gap: a marker excused only its own line,
   while the constructs are multi-line, so the escape hatch looked like it
   worked and did not. It now excuses a four-line window.

`standard-allow` is preferred over `eslint-disable-next-line` (invisible to a
source scan, and a lie for a rule implemented as a test) and over a `Set` of
`file:line` strings or a filter inside the test (those live far from the code and
drift). A marker without a real reason is rejected, and the set is asserted to
stay at three or fewer — a rule that needs more exceptions is the wrong rule.

## Phase 4 — the two tautologies, and the dead helper they protected

`createIdempotentRequest()` is **deleted**. It bundled key creation and header
attachment into one object, which cannot work across this architecture: a hook
cannot hand an Axios config to a service, because the service is the only holder
of the client. So the split is by design — the hook mints a key and holds it, the
service attaches the header with `withIdempotencyKey` — and the standard's rule
was amended to describe it. The `IdempotentRequest` *type* stays; it is still
widely used by the document transport.

The old test file is reduced to what a source scan genuinely cannot do: assert
that the standard document still exists and is substantive, and that it still
contains the boundaries the enforced rules depend on. Those are anchors, not a
spell-check — if a future edit removes the rationale for a rule, the anchor
fails and the rule is reconsidered deliberately rather than left orphaned.

## Deliberately not built

| Skipped | Why |
| --- | --- |
| A bare `?? null` / `?? []` scan | 172 hits, no discriminating power. The correlated form carries the signal. |
| Handwritten-DTO detection in services | 2 hits against 2 required exclusions. Net zero value. |
| `withRowVersion` usage | The failure mode is `rowVersion + 1` — a semantic bug with no syntactic signature. Review-only. |
| MSW factory / no-broad-handler rules | "ordinary" and "broad" are judgements, undecidable statically. |
| "Scope and balances remain server-authoritative" | Requires knowing the server's authority. Not in the source. |
| A custom ESLint rule for the scans' rules | It would have to hard-code `queryKeys.scoped`'s tuple layout — re-creating the exact coupling the scans exist to prevent. A shape-agnostic regex cannot go stale the same way. |
| A codemod | Right tool for the fixes, wrong tool for the guard. The checks land first so the checks can prove the fixes worked. |

**Follow-up, and structurally the right fix:** brand the key as a
`ScopedQueryKey` type so a hand-built key becomes a **type error** and the defect
is unrepresentable rather than merely detected. Better than any scan. The blast
radius is 19 files, so it is recorded in `eiams-frontend-wmwz` rather than
attempted here.

## What this does NOT prove

- A rule is not a decision. `no-restricted-syntax` catches the token, not the
  intent; a service that reaches for a cache write through a variable still
  passes. These guards make the cheap violations impossible and leave the
  expensive ones to review.
- **Zero violations is not self-proving.** Every rule here has zero findings
  today. Each is backed by a negative control or a manual probe, because a rule
  that finds nothing forever has demonstrated nothing on its own.
- The scan set is asserted by count, not by content. A file could be added to the
  hook set without the rule set being re-examined.
- Scan 1 checks for the *shape* of a hand-derived key. A sufficiently indirect
  derivation would not match.

## Change log

- `eslint.config.js` — service-purity block: 16-file scope, 4 restricted imports,
  9 restricted syntax rules.
- `src/test/support/source-scan.ts` — **new**; hoisted scanning helpers, the
  allow-marker grammar, and the two drift guards.
- `src/test/feature-service-composition-standard-scans.test.ts` — **new**; three
  scans with 14 cases, 8 of them negative controls or drift guards.
- `src/test/feature-service-composition-standard.test.ts` — reduced to a
  document-existence guard.
- `src/shared/services/api-path.ts` — **new**; `pathWithId`, replacing nine
  copies of a three-line helper.
- `src/shared/services/mutation-safety.ts` — `createIdempotentRequest` deleted.
- `docs/feature-service-composition-standard.md` — retry-sensitive rule amended
  to the two-layer contract the architecture actually supports.
- `count.service.ts`, `adjustment.service.ts` — path constants typed, count
  interpolations encoded.
- `organization.service.ts`, `use-external-party-mutations.ts` — header owned by
  the service; key held in a ref.
- `use-adjustment-actions.ts`, `use-adjustment-queries.ts`,
  `use-count-queries.ts` — retry-safe keys; hand-derived prefixes replaced with
  the shared factories.
- `use-document-draft-mutations.ts` — positional key predicate replaced with a
  factory-derived prefix; `DOCUMENT_RESOURCE` exported from its owner.
- `docs/concurrency-partial-failure-verification.md` — quotes the amended rule.

Gates: see the close reason.
