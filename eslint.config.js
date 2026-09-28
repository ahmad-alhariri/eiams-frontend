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
