# Bundle and lazy-route budgets

**Status:** Enforced in CI
**Bead:** `eiams-frontend-e25-t06`
**Derived:** 2026-10-28, re-derived 2026-10-30 and 2026-11-02
**Mechanism:** `scripts/check-bundle-budget.mjs` plus `src/test/lazy-route-budget.test.ts`

## What these numbers are, and what they are not

No product document states a bundle size target. The numbers below are
**regression ceilings**: they were derived from a production build (2026-10-28,
re-derived 2026-10-30 and 2026-11-02) so that a change which quietly inflates the shipped
bundle, or quietly replaces a lazily imported route page with a static import,
**fails the build** instead of reaching users. They are not performance targets
and they are not a claim that the current bundle is the right size.

Raising a ceiling is a deliberate act: edit `src/config/bundle-budget.json`
and say why in the commit. Silently raising it to make a gate green defeats
the gate.

## The committed budget

`src/config/bundle-budget.json` is the **single** source of the numbers. The
check script and the Vitest tests both read that file, so there is no second
copy to drift.

| Ceiling | Value | Measured from |
| --- | --- | --- |
| `maxJsChunkCount` | 169 | count of `dist/assets/*.js` |
| `maxJsTotalBytes` | 1615445 | summed size of `dist/assets/*.js` |
| `maxLargestChunkBytes` | 344750 | largest single `dist/assets/*.js` |
| `routePageCount` | 59 | `getWiredRouteKeys().length` |

Re-measure with `pnpm run build`, then sum the sizes of the files in
`dist/assets`.

### Re-derivation log

| Date | Bead | Change | Chunk count | Total JS bytes | Largest chunk |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28 | `eiams-frontend-e25-t06` | first derivation | 168 | 1609146 | 342842 |
| 2026-10-29 | live-API merge | merged production code | 168 | 1610964 | 343958 |
| 2026-10-30 | `eiams-frontend-cwjc` | session bootstrap (device hints, public-route logic) | 168 | 1611285 | 344020 |
| 2026-10-30 | `eiams-frontend-e25-t07` | server-table workflow hardening (scope-aware placeholders, refresh state, pagination clamp) | 168 | 1612779 | 344020 |
| 2026-10-30 | `eiams-frontend-e25-t04` | responsive workflow audit (mobile touch-target floor on the shared Button, checkbox hit area, date-picker clear button, logical drawer inset) | 168 | 1613066 | 344064 |
| 2026-10-30 | `eiams-frontend-e25-t04` (fix round) | element-level touch-target fixes (header brand link, table-cell link rule, print trigger, shared select and dropdown options) | 168 | 1613293 | 344082 |
| 2026-11-02 | frontend architecture remediation | shared-to-module dependency direction, scope-wide invalidation, centralized query-resource vocabulary, and the Arabic-digit conversions that shipped with them | 169 | 1615445 | 344750 |

The `e25-t04` growth is 287 bytes of Tailwind class names in the shared UI
chunks, 44 of them in the largest chunk (`index-*.js`); its fix round adds a
further 227 bytes for the same reason. No module, chunk or route was added,
and the route page count is unchanged at 59.

The 2026-11-02 growth is three new lazy chunks (34 bytes for the shared
active-scope shim, 268 bytes for each of the two document-list route wrappers) plus
the byte cost of the Arabic-digit work that was in the tree at the same time. The
scope vocabulary is type-only and emits no chunk, and no route was added, so the
route page count is unchanged at 59. The measured bundle is now 1,615,035 bytes,
which is 410 bytes UNDER the ceiling, so the ceiling was deliberately left where it
is rather than re-derived downwards.

## The lazy-route invariant

Every routed page is loaded with `React.lazy` and a dynamic `import()`, and the
registry contains **no** static import of a module page. `dashboard`, `profile`
and `settings` are wired to `routePlaceholderPage`, which is itself a lazily
imported module. `src/test/lazy-route-budget.test.ts` proves all of that with
a text scan of `src/config/route-registry.tsx`, and includes a synthetic
negative control so the detector is known to be able to fail.

## How the budget is enforced

`scripts/check-bundle-budget.mjs` measures `dist/assets` and exits non-zero
when a ceiling is breached, printing the measured value against the ceiling.
It is a **separate script rather than a Vitest test** because `pnpm run
quality` runs the test suite **before** the build, so a test could only ever
assert against a bundle that does not exist yet. The script fails loudly when
`dist/assets` is missing; it never silently passes.

The check is wired into `pnpm run quality` as its final step, immediately
after `pnpm run build`, and `pnpm run budget:bundle` is also available on its
own. `.github/workflows/quality.yml` already runs `pnpm run quality`, so the
budget is enforced on every pull request without a separate job.

## Revert-proofs

- **The bundle check fails when the bundle grows.** Adding a 4,000,000-byte
  file to `dist/assets` made `check-bundle-budget.mjs` exit 1 with "The built
  bundle grew past the committed ceiling." Removing it returned the exit code
  to 0. The inflation file was a build artefact, never a source file.
- **The lazy-route detector can fail.** The synthetic negative control feeds
  the detector an eagerly imported entry and asserts it is rejected.