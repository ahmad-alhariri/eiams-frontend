# Bundle and lazy-route budgets

**Status:** Enforced in CI
**Bead:** `eiams-frontend-e25-t06`
**Derived:** 2026-10-28
**Mechanism:** `scripts/check-bundle-budget.mjs` plus `src/test/lazy-route-budget.test.ts`

## What these numbers are, and what they are not

No product document states a bundle size target. The numbers below are
**regression ceilings**: they were derived from a production build on
2026-10-28 so that a change which quietly inflates the shipped bundle, or
quietly replaces a lazily imported route page with a static import, **fails
the build** instead of reaching users. They are not performance targets and
they are not a claim that the current bundle is the right size.

Raising a ceiling is a deliberate act: edit `src/config/bundle-budget.json`
and say why in the commit. Silently raising it to make a gate green defeats
the gate.

## The committed budget

`src/config/bundle-budget.json` is the **single** source of the numbers. The
check script and the Vitest tests both read that file, so there is no second
copy to drift.

| Ceiling | Value | Measured from |
| --- | --- | --- |
| `maxJsChunkCount` | 168 | count of `dist/assets/*.js` |
| `maxJsTotalBytes` | 1609146 | summed size of `dist/assets/*.js` |
| `maxLargestChunkBytes` | 342842 | largest single `dist/assets/*.js` |
| `routePageCount` | 59 | `getWiredRouteKeys().length` |

Re-measure with `pnpm run build`, then sum the sizes of the files in
`dist/assets`.

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