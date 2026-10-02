import eslintConfigPrettier from 'eslint-config-prettier'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    '.beads',
    'contracts/openapi/*.json',
    'src/shared/types/generated',
    'vite-dev.err.log',
    'vite-dev.out.log',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // No application source may import the test-support tree — the lint-time half
    // of the rule `src/test/no-runtime-test-imports.test.ts` already enforces
    // (EPIC G7, eiams-frontend-yqpe).
    //
    // `src/test/**` is test support: MSW handlers, factories, the canonical
    // lifecycle engine. It runs under Vitest with jsdom and MSW's Node
    // interceptors, none of which exist in a browser deployment. A production
    // module importing it drags that tree into the app bundle — dead weight at
    // best, and for the handlers actively dangerous, because a fixture handler
    // reachable from an app chunk is a fixture able to answer a real request.
    //
    // Why a test alone was not enough
    // -------------------------------
    // The scan is GREEN, but the quality gate runs `lint` before `test`
    // (`pnpm run quality`). A violation introduced today is therefore reported
    // only after the full Vitest suite has run — minutes, and the author has
    // usually moved on — when `pnpm run lint` would have named the offending
    // file and line in seconds, on the file that was just edited. Enforcing at
    // lint time also moves the check to the only moment the author is actually
    // looking at the import. The test stays: it scans the whole tree including
    // files ESLint never sees, and it proves non-vacuity with a synthetic
    // negative control and a pinned file count.
    //
    // Why the scope is spelled out rather than inherited
    // --------------------------------------------------
    // Flat config merges by REPLACEMENT, not by union: a later config object
    // that sets `no-restricted-imports` discards the earlier one's `paths`
    // entirely. An unscoped block placed after the service-purity block below
    // would therefore silently DELETE that block's four import bans
    // (@tanstack/react-query, zustand, react, @/shared/ui/toast-manager)
    // without any error — a rule that disappears is worse than one that never
    // existed. So this block must not overlap the service scope. It is placed
    // BEFORE the service block and excludes the four service globs, which
    // keeps each block the sole authority on the files it owns.
    //
    // `files` is inclusive-only, so the exemptions are expressed as `ignores`
    // in the same object (scoped ignores, not `globalIgnores`, so they narrow
    // this block only and leave those files linted by the config above):
    //   - `src/test/**` and `*.test.ts(x)` anywhere — the ~150 legitimate
    //     importers. `src/test/**` alone is not enough: co-located test files
    //     under `src/modules/**` and `src/shared/**` import `@/test/**` too,
    //     and missing them would make `pnpm run lint` red on all of them.
    //   - the four service globs, per the replacement note above. Those 17
    //     files are therefore NOT covered by this lint rule: the service block
    //     owns `no-restricted-imports` for them and wins the merge, so the two
    //     configurations cannot both apply. That gap is covered by the test
    //     guard, which scans the whole tree and does reach service files —
    //     verified, not assumed. The layering is deliberate rather than
    //     incidental: `lint` is the fast, per-edit signal for the ~330 other
    //     application files, and `no-runtime-test-imports.test.ts` is the
    //     complete one. Closing the lint gap for services would mean adding the
    //     `@/test` patterns to the service block's own `paths`, which is out of
    //     scope here.
    //
    // There is deliberately NO escape hatch. The test guard has no allowlist
    // and the epic's criterion is "none", so an accepted exception would have
    // to be honoured by BOTH checks; `// standard-allow:` is invisible to
    // ESLint (it is consumed by `withoutAllowMarkers` in the scan) and
    // `eslint-disable` is invisible to the scan, so neither marker can excuse
    // a line in both places. A rule that cannot be excepted is also a rule
    // whose fix is always the right one: the code belongs in application
    // source, not in the test tree.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/test/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'src/modules/*/services/*.service.ts',
      'src/shared/documents/*-service.ts',
      'src/shared/documents/*-transport.ts',
      'src/shared/services/*-transport.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // `@/test` (bare) and `@/test/**` (every subpath), matching the
              // test guard's `(@\/test[^'"]*)`: it anchors on the prefix and
              // does not require the slash, so the bare-directory form is
              // caught there and is caught here. `@/test*` is NOT used — it
              // would also match a legitimate `@/testing/**` tree.
              group: ['@/test', '@/test/**'],
              message:
                'Application source must not import the test-support tree (@/test/**). Those modules run under Vitest with jsdom and MSW, none of which exist in a browser build, and a fixture handler reachable from an app chunk can answer a real request. This is the lint-time half of src/test/no-runtime-test-imports.test.ts; fix the import rather than silencing it.',
            },
          ],
        },
      ],
      // `no-restricted-imports` only inspects static import/export
      // declarations, so `await import('@/test/msw/server')` would slip past it
      // while the test guard — which matches the specifier after `import(` —
      // reports it. This selector closes that gap so the two agree.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^@\\/test(\\/|$)/u]',
          message:
            'Application source must not import the test-support tree (@/test/**), dynamically or otherwise. A dynamic import is still a bundle edge — see src/test/no-runtime-test-imports.test.ts.',
        },
      ],
    },
  },
  {
    // Service purity — the machine-enforced half of
    // `docs/feature-service-composition-standard.md`. A feature service is a
    // transport: it builds a request and returns response data. It is not where
    // UI feedback, cache mutation, session or navigation concerns belong, and a
    // service that reaches for any of them is a service that has quietly become
    // a second, ungoverned layer.
    //
    // Previously nothing enforced this at all: the only test referencing the
    // standard asserted that the standard's *documentation* still contained
    // certain strings, so it would have passed with every service in the repo
    // violating every rule in it (eiams-frontend-xlfs).
    //
    // The file globs are deliberately narrow. `src/modules/**/services/**`
    // would also match `auth/session-lifecycle.ts` and
    // `auth/active-scope-context.ts`, which legitimately own the QueryClient and
    // the auth session key that the standard explicitly assigns to the auth
    // module — the `*.service.ts` convention is what makes this scope exact, and
    // is a reason to keep that naming.
    files: [
      'src/modules/*/services/*.service.ts',
      'src/shared/documents/*-service.ts',
      'src/shared/documents/*-transport.ts',
      'src/shared/services/*-transport.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/react-query',
              message:
                'A service must not depend on the query cache. Invalidating or reading a query belongs to the hook or page that owns it (see useInvalidateDocumentDetail).',
            },
            {
              name: 'zustand',
              message:
                'A service must not read or write UI state. Server records stay in TanStack Query; UI state belongs in a store owned by the UI.',
            },
            {
              name: 'react',
              message:
                'A service must not import React. If a component needs this data, the hook that reads the service provides it.',
            },
            {
              name: '@/shared/ui/toast-manager',
              message:
                'A service must not raise toasts. A toast is presentation and belongs at the hook or page boundary that has the Arabic feedback context.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        // Must not create an Axios instance: a second one means a second
        // interceptor chain, so auth/trace/error handling silently diverge.
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='axios'][callee.property.name='create']",
          message:
            'A feature service must not create an Axios instance. Inject the shared client; a second instance means a second interceptor chain.',
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Never call fetch directly. Use the injected Axios client so auth, trace and error normalization all apply.',
        },
        {
          selector: "MemberExpression[property.name='interceptors']",
          message:
            'A feature must not add an interceptor or header. Cross-cutting transport policy belongs in the shared API client, and a global retry interceptor is separately forbidden by the standard.',
        },
        {
          selector: "NewExpression[callee.name='QueryClient']",
          message:
            'There is one application QueryClient (createQueryClient). A service must never construct its own.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='setQueryData'], CallExpression[callee.type='MemberExpression'][callee.object.property.name='updateQueryData']",
          message:
            'A service must not write to the query cache. Optimistically creating ledger, lifecycle, balance, custody or asset-history records is forbidden outright (D-LIFE-01); the owning hook invalidates instead.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='invalidateQueries'], CallExpression[callee.type='MemberExpression'][callee.object.property.name='removeQueries']",
          message:
            'A service must not mutate the cache. On a successful mutation, the hook invalidates the exact authoritative query keys the contract response affects.',
        },
        {
          selector:
            "CallExpression[callee.name='normalizeApiError'], CallExpression[callee.name='isConflictError']",
          message:
            'A service must not normalize errors. It returns response data or throws; normalizeApiError(error) is applied at the hook or page boundary where Arabic feedback is presented.',
        },
        {
          selector:
            "CallExpression[callee.name='useNavigate'], CallExpression[callee.name='usePermission']",
          message:
            'A service must not navigate or infer permissions. Both are decisions of the presentation layer.',
        },
        {
          selector: "Literal[value='Idempotency-Key']",
          message:
            "Route the Idempotency-Key header through the service's withIdempotencyKey call. A feature-local header literal bypasses the shared retry-safety contract.",
        },
      ],
    },
  },
  eslintConfigPrettier,
])
