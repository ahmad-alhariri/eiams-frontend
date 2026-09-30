# Direct Backend Integration Plan

**Decision:** D-INT-02  
**Status:** Architectural direction accepted; execution plan awaiting review  
**Date:** 2026-09-02  
**Beads:** `eiams-frontend-vi65`, `eiams-frontend-vi65.1`  
**Repositories:** `eiams-frontend` and `eiams-backend/EIAMS`

## 1. Outcome

Integrate the React frontend directly with the running .NET backend, beginning
at `http://localhost:5000`, without any OpenAPI-to-TypeScript generation. Build
one reliable transport foundation, then reconcile and migrate one EIAMS domain
module at a time until:

- every frontend request targets a real backend controller;
- every request, response, enum, query, pagination, and error shape is described
  by handwritten TypeScript owned by the module that consumes it;
- the frontend correctly unwraps the backend's generic response envelope;
- backend and frontend business behavior agree, with backend changes made when
  an actual EIAMS invariant or production requirement is missing;
- development uses the real localhost backend by default;
- MSW remains a test adapter, not a development source of truth;
- the provisional OpenAPI snapshot, generated TypeScript, generator scripts,
  dependencies, tests, and documentation are removed;
- both repositories pass their own quality gates plus a real cross-repository
  smoke test.

This is a controlled migration, not a big-bang rewrite. A module is considered
integrated only when its backend behavior, handwritten types, service logic,
tests, Arabic UI, and live-browser flow agree.

## 2. Decisions and source-of-truth rules

### 2.1 Authority

1. The running backend and its C# source are authoritative for transport facts:
   route, HTTP method, query names, body fields, serialized names, status codes,
   response envelope, pagination, authentication, concurrency, and errors.
2. Backend domain rules and ratified EIAMS decisions are authoritative for
   business behavior. A currently implemented backend shortcut does not defeat
   an approved invariant such as exactly one User role-scope assignment,
   immutable ledgers, document-driven stock changes, or negative-stock blocking.
3. The frontend owns presentation concerns: Arabic labels and safe messages,
   form state, display models, formatting, accessibility, and optimistic UI
   behavior.
4. Swagger is permitted only as a human inspection and troubleshooting surface.
   No frontend build, test, or type depends on an OpenAPI file.
5. A generated TypeScript artifact is never edited into a handwritten contract.
   New module types are written from the controller/request/response records and
   verified against a real HTTP response.

### 2.2 Default conflict policy

For every divergence, classify it before changing code:

| Divergence | Default owner | Resolution |
| --- | --- | --- |
| Route, verb, query name, JSON name | Backend implementation | Frontend adapts unless versioning or route safety requires a backend foundation change. |
| Generic envelope, pagination, resource-ID mutation response | Backend infrastructure | Shared frontend transport unwraps and normalizes it once. |
| Missing business invariant or authorization check | Backend/domain | Fix and test backend first, then type the published behavior. |
| Arabic copy, labels, formatting, form convenience | Frontend | Keep out of backend transport DTOs. |
| Backend DTO inconvenient for UI but semantically correct | Frontend adapter | Map wire response to a focused frontend model. |
| Duplicate or ambiguous semantics across both sides | Joint architecture decision | Record a small decision and update both sides in the same migration slice. |

Do not preserve a provisional frontend path merely because many callers use it.
Do not change a correct backend route merely to imitate the old snapshot. Do not
hide real incompatibility in a broad compatibility adapter.

## 3. Repository baseline and confirmed gaps

### 3.1 Frontend baseline

- React 19, TypeScript 6 strict mode, Vite 8, Axios, TanStack Query, React Hook
  Form, Zod, Vitest, Testing Library, and MSW.
- 251 source files currently import `src/shared/types/generated/eiams-v1.ts`:
  177 production files and 74 test/mock files.
- Existing module `types/*.types.ts` files mostly alias generated `operations`
  rather than owning useful module interfaces.
- Feature services usually call `client.get<T>()` or `client.post<T>()` and
  return `response.data` as if the server returned a bare entity/page.
- Development mocks default to enabled. The Vite proxy assumes `/api/v1` and a
  backend target at port 8080, while the live launch profile uses port 5000.
- The quality gate runs `api:types:check`; package scripts, dependencies,
  architecture tests, runbooks, and many design documents enforce the old
  generator strategy.
- The frontend has 15 implemented domain directories. The backend also exposes
  reports, but there is no matching `src/modules/reports` directory yet.

### 3.2 Backend baseline

- .NET 10 Clean Architecture with strict nullable analysis, warnings as errors,
  EF Core/PostgreSQL, JWT bearer authentication, Serilog, OpenTelemetry,
  integration tests, and 170 controller operations across 169 controller files.
- Controllers currently use unversioned resource-root routes such as `/users`,
  `/sites`, `/materials`, `/inventory-balances`, and `/warehouse-documents`.
- Successful JSON responses use the existing generic envelope:
  `{ success, data, pagination, meta }`.
- Errors use `{ success: false, error: { code, message, details, request_id } }`.
- Pagination is 1-based (`page`, `pageSize`) and the envelope serializes fields
  such as `page_size`, `total_items`, and `total_pages`.
- Create/update operations frequently return `{ id }` or an empty success
  response, while the frontend often assumes the full updated entity is
  returned.
- Optimistic-concurrency request fields are commonly named
  `expectedRowVersion`, not `rowVersion`.
- Authentication routes are currently `/users/login`, `/users/refresh-token`,
  `/users/session`, and `/users/logout`; login uses `email`.
- The session response is already conceptually singular (`user`, `role`,
  `scope`, `permissionCodes`), but account creation can still persist a User
  without its required role-scope assignment and legacy grant/remove routes can
  violate the exactly-one lifecycle.

### 3.3 Live localhost observations

On 2026-09-02 the backend answered on `http://localhost:5000` and Swagger was
available. Foundation failures must be resolved before module work:

- `/health` returned HTTP 500;
- an unauthenticated `/users/session` request returned the generic 500 envelope
  rather than a structured 401;
- CORS preflight for `http://localhost:5173` returned `Access-Control-Allow-Origin:
  *` without `Access-Control-Allow-Credentials`, which is incompatible with the
  frontend's credentialed refresh-cookie requests;
- development configuration contains a database credential in a tracked JSON
  file and must be removed and rotated before production-readiness work.

## 4. Target integration architecture

```text
React page/hook
    -> domain module interface
        -> handwritten request/response types and focused adapter
            -> shared ApiTransport
                -> credentialed Axios adapter
                    -> authoritative .NET controller
```

### 4.1 Deep shared transport module

Create `src/shared/api/` as the single transport seam. It owns behavior that all
modules would otherwise repeat:

- base URL and timeout configuration;
- bearer-token installation and one-flight refresh;
- credentialed cookie behavior;
- generic success-envelope validation and unwrapping;
- generic pagination normalization;
- structured backend-error extraction;
- safe Arabic fallback mapping;
- request ID propagation for support and observability;
- malformed/non-JSON response detection;
- cancellation via `AbortSignal`;
- `204`/empty-success behavior;
- reusable idempotency and concurrency helpers.

Its external interface should stay small. A representative interface is:

```ts
export interface ApiTransport {
  request<TResponse, TBody = never>(request: ApiRequest<TBody>): Promise<TResponse>
  requestPage<TItem>(request: ApiRequest<never>): Promise<ApiPage<TItem>>
  requestEmpty<TBody = never>(request: ApiRequest<TBody>): Promise<void>
}
```

The Axios adapter is the production implementation. MSW is the network-level
test adapter. Module tests exercise the same transport behavior used in the
browser; do not maintain a second fake client with different envelope rules.

### 4.2 Generic handwritten wire types

Define these once under `src/shared/api/api-contracts.ts`, matching the backend's
serialized JSON names exactly:

```ts
export interface ApiResponseMeta {
  request_id: string
  timestamp: string
}

export interface ApiPaginationResponse {
  page: number
  page_size: number
  total_items: number
  total_pages: number
  has_previous_page: boolean
  has_next_page: boolean
  total_count: number | null
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  pagination: ApiPaginationResponse | null
  meta: ApiResponseMeta
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details: unknown
    request_id: string
  }
}

export interface ResourceIdResponse {
  id: string
}
```

The transport converts paginated responses into a frontend-friendly model:

```ts
export interface ApiPage<T> {
  items: readonly T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}
```

The raw response metadata may be exposed to diagnostics, but ordinary module
callers should receive only the data or normalized page. This gives every module
leverage without teaching it envelope or snake-case details.

### 4.3 Error contract convergence

The backend currently has two validation-detail shapes and English diagnostic
messages. Before form-heavy modules migrate, standardize backend validation
details to a stable collection containing at least `field`, `code`, and
`message`. The frontend then:

- trusts status, code, details, and request ID as transport facts;
- maps known codes to safe Arabic presentation;
- maps field errors to React Hook Form without guessing property names;
- never displays raw exception or backend diagnostic text;
- retains the request ID in error UI/support details;
- treats unknown codes safely by status family.

Use backend 400 for request/validation failure unless a specific operation has a
documented reason for 422. Use 401 for authentication, 403 for authorization,
404 for concealed/not-found resources, 409 for concurrency/state conflicts,
and 429 for throttling.

### 4.4 Per-module ownership

Each module should converge on this layout:

```text
src/modules/<module>/
  types/
    <module>.api-types.ts   # exact wire queries, requests, responses, enums
    <module>.types.ts       # frontend/domain display models only when different
  adapters/
    <module>.adapter.ts     # only non-trivial wire -> frontend mappings
  services/
    <module>.service.ts     # routes and module interface
  hooks/
  schemas/
  pages/
```

Rules:

- Request and response types are separate; do not reuse a read model as a write
  payload.
- Optional means omittable; nullable means the JSON value may be `null`. Preserve
  `exactOptionalPropertyTypes` semantics.
- Dates remain ISO strings at the transport seam and are formatted at the UI
  edge. Decimal inventory quantities remain numbers only after backend precision
  is characterized; use strings if exact decimal transport requires it.
- C# `Guid` is a TypeScript `string`. Do not create branded IDs until two IDs are
  demonstrably confused in real code.
- Backend enum values are handwritten string unions close to the module and
  covered by serialization tests.
- Endpoint constants live with the module service. Do not recreate a global
  generated `paths` map.
- Use a focused adapter only when it hides meaningful differences, such as
  `expectedRowVersion` versus `rowVersion`, mutation `{ id }` results, singular
  session naming, redaction, or flattened nested labels. Do not add pass-through
  adapter files.
- TanStack Query remains the owner of server state. Zustand remains UI-only.

## 5. Localhost foundation

### 5.1 Recommended development topology

Use a direct cross-origin development connection:

- frontend: `http://localhost:5173`;
- backend: `http://localhost:5000`;
- PostgreSQL: local container on port 5432;
- optional Seq: local container on port 8081.

Add a backend `/api/v1` prefix before module migration. Versioning is cheaper now
than after handwritten paths are spread across modules. Keep the backend's
resource-root route vocabulary unless a business or security reason requires a
change; do not perform the old bulk renames merely to match the provisional
snapshot.

Development frontend configuration should use:

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Production should prefer same-origin HTTPS and a reverse proxy:

```dotenv
VITE_API_BASE_URL=/api/v1
```

The environment parser must accept a safe origin-relative production path and a
validated localhost HTTP URL in development. It must reject embedded credentials,
query strings, fragments, and insecure non-local production origins.

### 5.2 Backend readiness gates

Before auth/module migration:

1. Remove tracked connection credentials, rotate them, and use user-secrets or
   environment variables.
2. Validate database and JWT settings on startup with actionable errors.
3. Make `/health` return 200 only when required dependencies are ready; expose a
   separate liveness endpoint if needed.
4. Configure CORS with the exact Vite origin and `AllowCredentials`; never pair
   credentialed requests with a wildcard origin.
5. Add the `/api/v1` route prefix consistently.
6. Return the generic 401/403 envelope from authentication/authorization
   failures instead of 500.
7. Keep refresh tokens in an `HttpOnly`, `SameSite=Strict`, appropriately secure
   cookie. Remove refresh-token response/body compatibility after the frontend
   has migrated.
8. Define one supported local startup path and document required seed accounts.

### 5.3 Mock policy

- Remove the development-time `VITE_ENABLE_API_MOCKS` branch once foundation
  integration works. `pnpm dev` must call the real backend by default.
- Keep MSW in Vitest and component tests. Update handlers to use the real routes,
  generic envelopes, 1-based pagination, and real mutation results.
- Test fixtures are examples, not a second contract. Their owning module types
  must type them.

## 6. Safe retirement of OpenAPI generation

Use a strangler sequence so the app continues to compile:

1. Ratify D-INT-02 and mark D-INT-01's generation strategy superseded.
2. Remove `api:types:*` and `contract:validate` from the active quality gate so
   no generator runs after the decision.
3. Remove `openapi-typescript` and generator-only Redocly dependencies.
4. Add an architecture test that forbids new imports from
   `@/shared/types/generated/eiams-v1`.
5. Keep the current generated file frozen only as temporary migration
   scaffolding. Each module task must reduce its import count to zero.
6. Rewrite snapshot-dependent behavioral tests as module contract/service tests.
7. When repository-wide generated imports reach zero, delete:
   - `src/shared/types/generated/`;
   - `contracts/openapi/` snapshot/provenance/evidence files;
   - `scripts/generate-api-types.mjs`;
   - `scripts/openapi-generation.config.mjs`;
   - `scripts/validate-contract.mjs`;
   - `src/test/openapi-generation.test.ts` and obsolete snapshot tests.
8. Update `README.md`, `AGENTS.md`, `CLAUDE.md`, SAD/architecture documents,
   runbooks, CI expectations, ESLint ignores, and foundation tests.
9. Add a final zero-reference check for `openapi-typescript`, generated contract
   paths, provisional provenance, and generated imports.

Do not delete the legacy generated file first; doing so would create hundreds of
unrelated errors and force a risky big-bang migration.

## 7. Module migration protocol

Every module follows the same checklist:

1. Inspect its backend controllers, request records, application response
   records, validators, domain enums, authorization attributes, and integration
   tests.
2. Exercise the endpoints against a dedicated local database and capture status,
   body, pagination, headers, cookies, and error cases in the contract-delta
   ledger.
3. Decide each divergence using section 2.2; create backend follow-up Beads for
   missing invariants rather than embedding workarounds in the frontend.
4. Write the module's wire types and route builders.
5. Add only meaningful adapters and keep Arabic/UI fields out of wire types.
6. Migrate the module service to `ApiTransport`; respect `{ id }`, empty-success,
   and paginated responses.
7. Align query keys, mutations, invalidation/refetch, Zod forms, selectors, and
   pages.
8. Replace module MSW handlers and factories with real envelopes and routes.
9. Add backend JSON characterization tests and frontend transport/service/hook/UI
   tests.
10. Run live Browser QA in Arabic RTL at desktop/tablet/mobile, including
    loading, empty, validation, permission, conflict, and network states.
11. Confirm the module has zero generated imports and no old endpoint strings.
12. Record resolved deltas, run both quality gates, and close only that module's
    Bead.

Keep transport migration, semantic backend correction, and visual redesign as
separate reviewable changes whenever possible.

## 8. Dependency-ordered module plan

### Wave 0 — Foundation and environment

**Backend:** configuration/secrets, JWT startup validation, health/liveness,
credentialed CORS, `/api/v1`, auth failure envelopes, validation details, refresh
cookie policy.  
**Frontend:** environment parsing, real-backend default, shared generic contracts,
`ApiTransport`, error/pagination normalization, request cancellation, initial
MSW envelope helpers, generator freeze guard.  
**Exit:** health is green; unauthenticated session is a structured 401; CORS sends
the exact origin plus credentials; transport tests cover data/page/empty/error/
malformed/401-refresh behavior; no generator runs in quality.

### Wave 1 — Authentication and session

Backend surfaces: Users login, refresh, session, logout, and token cookies.  
Frontend ownership: `auth.api-types.ts`, session model/adapter, memory-only access
token, one-flight refresh, route guards, static singular scope display.  
Required correction: complete exactly-one assignment/session semantics before
admin user management; session exposes one effective role and one active scope.
Prefer login/refresh returning only an access token while the refresh token stays
cookie-only; hydrate the authoritative session separately.  
**Exit:** login → session → protected route → refresh → logout works against
localhost; tokens never enter storage/logs; invalid assignment blocks access;
all auth generated imports are gone.

### Wave 2 — Organization reference data

Backend surfaces: Organizations, Sites, OrganizationalUnits, Employees,
ExternalParties, Counterparts.  
Key reconciliation: flat backend routes, 1-based page queries, separate status
commands, `expectedRowVersion`, `{ id }` mutation responses, and whether the
Organization root needs a frontend administration page.  
**Exit:** Arabic lists, trees, selectors, CRUD/status flows, scope concealment,
pagination, and conflicts work live; module imports are handwritten only.

### Wave 3 — Catalog

Backend surfaces: MaterialDomains, MaterialCategories, MaterialFamilies,
Materials, UnitsOfMeasure, MaterialUnitConversions.  
Key reconciliation: remove provisional `/catalog/*` assumptions, type backend
enum strings, status endpoints, category move, unit-conversion add/update/remove,
decimal precision, and mutation refetch behavior.  
**Exit:** classification hierarchy and all material/UOM/conversion forms operate
against localhost without snapshot-derived types.

### Wave 4 — Warehouses and capabilities

Backend surfaces: Warehouses, WarehouseCapabilities,
WarehouseCapabilityOperations, WarehouseMaterialSettings.  
Key reconciliation: capability grant/revoke/operation routes, separate setting
create/update/status routes, expected row versions, and scope-restricted
selectors.  
**Exit:** warehouse CRUD, capability operations, material settings, authorization,
and conflict recovery are real-backend verified.

### Wave 5 — Administration and RBAC

Backend surfaces: Users, Roles, RolePermissions, Permissions, UserRoleScopes.  
Prerequisites: organization/warehouse selectors and backend exactly-one lifecycle
enforcement.  
Key reconciliation: `/users`, `/roles`, `/permissions`, singular
`/users/{id}/role-scope`, atomic CreateUser plus assignment, removal of plural
grant/revoke/list behavior, and singular session invalidation.  
**Exit:** every created User has one role at one Enterprise/Site/Warehouse scope;
the Arabic editor has one assignment; permission mutations refresh the session;
no forbidden zero/multiple state exists through UI, API, import, or concurrency.

### Wave 6 — Inventory reads

Backend surfaces: InventoryBalances and StockMovements, including warehouse and
document-specific reads.  
Key reconciliation: flat routes, missing/provisional balance-detail identity,
server sort/filter names, 1-based pagination, low-stock projection, decimal
precision, and immutable movement provenance. Add a backend endpoint when the UI
requires an identity/detail that cannot be fetched safely.  
**Exit:** balance and movement pages are server-paginated, scope-safe, precise,
and explainable against posted documents.

### Wave 7 — Shared warehouse-document spine

Backend surfaces: WarehouseDocuments, DocumentLines, attachments, policy,
history, submit/post/reject/return-to-draft/cancel/reversal actions.  
Key reconciliation: 26 controller operations, `expectedRowVersion`, idempotency
headers, `{ id }` and action response shapes, `return-to-draft` versus provisional
`revise`, reversal creation, multipart fields, signed-original policy, and
conflict recovery.  
**Exit:** shared document interfaces are deep enough that receiving, opening,
issue, transfer, and return modules supply only petal-specific behavior.

### Wave 8 — Receiving and opening

Backend surfaces: WarehouseDocument types, ReceivingInfo, supplier suggestions,
attachments, lines, and posting. Opening remains a document type rather than a
parallel balance mutation.  
**Exit:** draft → signed copy → submit/post flows create authoritative movements,
balances, and assets; no direct balance edit exists.

### Wave 9 — Asset registry and movement reads

Backend surfaces: Assets, derived current status, and asset movements.  
Key reconciliation: acquisition identity, asset-number versus serial-number
semantics, row-version names, status derivation, and selector-ready active/eligible
read models.  
**Exit:** receiving-created assets can be listed, inspected, and selected through
handwritten asset contracts before issue forms depend on them.

### Wave 10 — Issue, transfer, and return

Backend surfaces: IssueTo, TransferInfo, ReturnInfo, return-eligible items, shared
document actions.  
Key reconciliation: polymorphic counterparts, available balance, asset selection,
transfer atomicity, return provenance, and capability/scope enforcement.  
**Exit:** all three chains pass backend integration tests and responsive Browser
QA, including insufficient-stock and forbidden-scope failures.

### Wave 11 — Custody

Backend surfaces: Custodies, pending custody, assignment, transfer, and
timelines.  
Key reconciliation: durable-versus-asset custody subjects, pending custody
pages, row-version names, and immutable history/redaction.  
**Exit:** acquisition → issue → custody → transfer/return/disposal provenance is
continuous and frontend types no longer conflate asset number with serial number.

### Wave 12 — Inventory count and adjustment

Backend surfaces: InventoryCounts, lines/actuals/variance, freeze state,
InventoryAdjustments, disposal eligibility, and adjustment lines.  
Key reconciliation: lifecycle enum values, count line pagination/edit safety,
batch versus single updates, expected row versions, purpose-specific actions,
and count-to-adjustment separation.  
**Exit:** full/partial counts and direct/count/disposal adjustments operate with
server authority, negative-stock protection, and immutable resulting movements.

### Wave 13 — Audit and reports

Backend surfaces: AuditLogs and five report endpoints.  
Key reconciliation: list-header versus detail payloads, redaction before cache,
filter/pagination names, export/print payloads, and creation of the missing
frontend reports module.  
**Exit:** audit values cannot leak through list/cache/UI, report totals reconcile
with operational views, and Arabic print/export behavior is verified.

### Wave 14 — Final generator removal and production hardening

Delete the frozen generated artifact and all remaining OpenAPI frontend
infrastructure. Run the zero-reference audit, security review, accessibility and
responsive Browser QA, performance checks, production build, and deployment
smoke test behind the same-origin reverse proxy.

## 9. Testing and evidence strategy

### Backend

- Keep domain and application unit tests for invariants and authorization.
- Add/extend controller integration tests that assert exact JSON names, enum
  strings, envelope shape, pagination, validation details, error status/code,
  cookie flags, and request IDs.
- Test every mutation's success result (`id`, data, or empty), concurrency
  conflict, forbidden scope, and transaction rollback.
- Use a dedicated local/test PostgreSQL database; never run destructive
  integration fixtures against shared or production data.

### Frontend

- Test generic transport behavior once through its interface.
- Test pure adapters for non-trivial mapping and edge cases.
- Test each module service with MSW responses that match the backend envelope.
- Test hooks for query keys, cancellation, invalidation/refetch, and mutation
  errors.
- Test forms for handwritten request payloads and Arabic field-error mapping.
- Keep UI tests focused on observable behavior, not transport implementation.

### Cross-repository localhost suite

Add an opt-in command such as `pnpm run test:integration:local` that targets a
dedicated backend/database and verifies the current module's happy path plus
representative 400/401/403/404/409 behavior. It must fail fast when health or
seed prerequisites are missing and must never silently fall back to MSW.

For each completed module, record:

- backend commit/ref and relevant C# files;
- frontend commit/ref and handwritten type files;
- resolved route/field/status differences;
- backend test command/result;
- frontend focused and full gate results;
- localhost smoke result;
- Browser QA result and screenshots for UI modules.

## 10. Beads execution graph

The canonical program epic is `eiams-frontend-vi65`. The former OpenAPI-driven
`whhu` epic is superseded; its still-valid tasks were reparented rather than
duplicated.

| Order | Bead | Deliverable |
| --- | --- | --- |
| Decision | `vi65.1` | Ratify D-INT-02 and this execution plan. |
| Foundation, parallel | `whhu.4` | Direct localhost frontend environment and real-backend default. |
| Foundation, parallel | `whhu.6` | Backend `/api/v1`, configuration/secrets, health, and auth-failure envelopes. |
| Foundation, parallel | `whhu.9` | Exact credentialed CORS policy. |
| Foundation, parallel | `whhu.11` | Exactly-one User role-scope lifecycle. |
| Foundation convergence | `whhu.13` | Handwritten generic `ApiTransport` and envelope/error/pagination types. |
| Auth | `whhu.7` | Cookie-only authentication and singular session. |
| Module waves | `whhu.14`–`whhu.25` | Organization through audit/reports in the dependency order above. |
| Cleanup | `whhu.5` | Delete all frontend OpenAPI generator/snapshot/generated-type infrastructure after zero imports. |
| Final evidence | `whhu.10` | Cross-repository localhost smoke, contract-delta closure, full gates, and Browser QA. |

Tasks `whhu.2`, `whhu.3`, and `whhu.8` are superseded because backend OpenAPI
export, TypeScript generation, and bulk route renaming to match the provisional
snapshot are no longer part of the chosen architecture.

## 11. Production-readiness requirements

### Security

- Rotate and remove tracked database credentials immediately.
- Validate JWT secret, issuer, audience, and lifetime on startup.
- Cookie-only refresh token; no refresh token in JavaScript, logs, or JSON.
- Exact credentialed CORS origins; HTTPS and secure cookies in production.
- Server-enforced permissions/scopes on every operation; UI gating is only
  presentation.
- Redact secrets and audit values before they cross the HTTP seam.

### Reliability and observability

- Health/liveness/readiness endpoints have distinct, tested meanings.
- Preserve backend `request_id` through normalized frontend errors and support
  diagnostics.
- Keep Serilog/OpenTelemetry correlation; add safe frontend context without
  tokens or sensitive payloads.
- Define timeouts and cancellation; do not retry mutations automatically.
- Retain one-flight token refresh and idempotency keys for retry-sensitive
  actions.

### Performance

- Continue server-side pagination/filter/search; never download full ledgers.
- Keep master-data and operational TanStack Query stale-time policies.
- Invalidate narrowly after `{ id }` mutations and refetch authoritative state.
- Verify list payload size and database query count during each module migration.
- Preserve lazy-loaded pages and production bundle checks.

### Maintainability

- One module owns each wire type; shared types are limited to genuinely generic
  transport primitives and cross-module document concepts.
- No `any`; use `unknown` at untrusted transport points and narrow it.
- No global DTO barrel that recreates a monolithic generated contract.
- A type change names its matching backend request/response record in review.
- Update AGENTS.md and CLAUDE.md together when the new contract conventions are
  implemented.

## 12. Rollback and change isolation

- Migrate one module at a time; the last green module is the rollback point.
- Keep legacy generated imports only in unmigrated modules. Never mix handwritten
  and generated types inside a migrated module.
- If a backend semantic fix blocks a module, leave the module on its previous
  implementation and record the dependency; do not ship a frontend-only bypass.
- Separate bulk endpoint renames from payload/behavior changes.
- Do not delete generator artifacts until the repository-wide import count is
  zero and the full quality gate passes.
- Do not commit or push migration changes automatically; use the repository's
  conservative Beads handoff policy unless explicitly authorized.

## 13. Definition of done

The integration program is complete only when:

- no frontend file imports generated OpenAPI types;
- no OpenAPI generator/snapshot/provenance command, dependency, CI gate, test,
  or active documentation remains in the frontend;
- every implemented backend module has handwritten frontend wire types or an
  explicit documented reason that no frontend consumer exists;
- the shared transport matches the backend success/error/pagination envelopes;
- auth, cookies, CORS, health, secrets, versioning, and error behavior meet the
  foundation gates;
- all module backend tests, frontend focused tests, both full quality gates,
  localhost integration suite, production build, and Browser QA pass;
- the contract-delta ledger has no unresolved production blocker;
- `eiams-frontend-whhu` and dependent module Beads are closed with evidence.

## 14. First implementation slice after approval

Start only Wave 0:

1. repair backend local configuration, secrets, health, auth failure handling,
   CORS, and `/api/v1`;
2. add the shared handwritten envelope/error/pagination contracts and
   `ApiTransport`;
3. switch development to the real backend by default while retaining MSW only
   for tests;
4. remove generator commands from the active quality gate and forbid new
   generated imports;
5. prove one read endpoint, one paginated endpoint, one create returning `{ id }`,
   one validation error, and one authenticated refresh flow end to end.

Do not begin broad domain type migration until this slice is green in both
repositories.
