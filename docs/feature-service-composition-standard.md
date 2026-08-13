# EIAMS Feature Service Composition Standard

**Status:** Frontend implementation standard  
**Owner:** API and server-state infrastructure (`eiams-frontend-e08-t11`)  
**Applies to:** Every `src/modules/<domain>/services/` service and its query/mutation hooks

## Purpose

This standard gives every EIAMS domain the same seam between the generated
OpenAPI contract, the shared Axios boundary, TanStack Query, and presentation.
It prevents features from duplicating transport concerns, bypassing scope cache
isolation, or turning server failures into locally inferred state.

It complements, and does not replace, the generated contract. A missing
operation, request property, response property, error code, or business rule is
an OpenAPI/decision gap: do not create a handwritten DTO or a substitute API
endpoint.

## File ownership and dependencies

```text
src/modules/<domain>/
├── services/<domain>.service.ts  # contract-only Axios operations
├── hooks/use-<resource>-query.ts # TanStack Query keys, reads, invalidation
├── hooks/use-<action>-mutation.ts# TanStack mutation orchestration
├── types/                        # domain aliases only when generated types need composition
└── components/ or pages/         # presentation and Arabic feedback
```

Services may import only generated API types and the shared Axios client. Query
and mutation hooks compose a feature service with the shared query client and
query-key conventions. Components and pages call hooks; they never call Axios,
encode endpoint URLs, or assemble protected headers.

Each service exposes an injectable factory plus one application singleton:

```ts
export function createFeatureService(client: AxiosInstance): FeatureService {
  // typed contract operations only
}

export const featureService = createFeatureService(apiClient)
```

The factory is the test seam. Tests create an isolated Axios client with
`createApiClient`, then pass it to the factory. A service must not create an
Axios instance, own authentication/token state, instantiate a `QueryClient`,
or import UI primitives.

## Contract-only service rules

1. Define path constants with `satisfies keyof paths`; interpolate path
   parameters with `encodeURIComponent`.
2. Use generated request and response types directly. A small feature request
   interface is permitted only for browser transport shape (for example,
   multipart `File`) and must map exactly to generated contract fields.
3. Return response data or `void`; do not normalize errors, toast, navigate,
   infer permissions, transform a failure into a successful result, or mutate
   TanStack Query inside a service.
4. Never call `fetch` directly or add a feature-local interceptor/header.
   `apiClient` owns credentials and refresh behavior.
5. Scope, permission, document policy, balances, and resource versions remain
   server-authoritative. A service transmits the selected/generated values; it
   does not derive any of them.

## Query and mutation composition

Every feature hook gives its server data an explicit shared key:

- public reference data: `queryKeys.public(resource, ...parts)`;
- protected site/warehouse/enterprise data:
  `queryKeys.scoped(activeScopeCacheKey, resource, ...parts)`;
- session data: the owning auth module's `authSessionQueryKey`, never a second
  feature copy.

The query function calls the injected/domain service. Hooks use the shared
stale-time policy and only override it with a named policy constant. They do
not mirror server records into Zustand or local component state.

On a successful mutation, invalidate/refetch the exact authoritative query
keys affected by the contract response. Do not optimistically create ledger,
lifecycle, balance, custody, or asset-history records. A scope change is owned
by the active-scope context, which clears every protected scoped key before
installing the server session.

Use `normalizeApiError(error)` at the hook/page boundary where Arabic feedback
is presented or form field errors are mapped. On a contract `409`, use
`isConflictError(error)` only to select the feature's documented recovery:
discard stale transient UI and refetch its authoritative detail/policy/history
keys. A 409 can also be a state or idempotency conflict, so no generic helper
may assume a particular recovery or retry it automatically.

## Retry-sensitive mutations and row versions

For an operation whose generated OpenAPI parameters require `Idempotency-Key`:

1. Create `createIdempotentRequest()` once when the user starts the action.
2. Pass its `config` to Axios and retain that same object/key for an explicit
   retry of the same action after an uncertain transport outcome.
3. Start a distinct user action with a new idempotency context. Do not add a
   global Axios retry interceptor for these mutations.

For mutable aggregates, pass the current server-provided `rowVersion` in the
request body/query as required by that operation. `withRowVersion(payload,
rowVersion)` makes a copy; it never increments or manufactures a version. A
conflict response always wins over local form or cache state.

## Tests

Service and hook tests use the shared MSW server. Endpoint-specific handlers
remain inside the feature test, while ordinary contract-shaped payloads use
`src/test/msw/factories.ts` (for example `createProblemDetails`, `createPage`,
and entity factories). A feature test must cover the smallest relevant set:

- generated request body/query/path encoding and typed response mapping;
- required `Idempotency-Key` reuse for retry-sensitive actions;
- an authoritative 409/error path with Arabic-safe normalization at the
  presentation boundary;
- exact scoped/public query-key invalidation after success; and
- loading/error/empty or pending UI behavior when the hook has a user-facing
  surface.

Do not register a broad feature handler in `src/test/msw/handlers.ts`; the
baseline server is intentionally endpoint-neutral. Tests must exercise the
factory with an isolated `createApiClient` when observing transport behavior.

## Review checklist

- Service is a small factory with a singleton and no UI/query/auth side effects.
- Every path and payload is generated-contract-backed.
- Server data has one shared query key and does not enter Zustand.
- Error display occurs outside the service through `normalizeApiError`.
- Idempotency keys and `rowVersion` use `mutation-safety` helpers where the
  contract requires them.
- MSW tests use the shared factories and verify the feature-owned behavior.
