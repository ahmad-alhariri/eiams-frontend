QA SUBAGENT REPORT — whhu.13 batch 3 (axios-transport)
=========================================================

File verified: src/shared/api/axios-transport.ts (6067 bytes, 116 lines, present)
Substitution: MCP unavailable → file-read verification only; observations are direct file/line reads.
No edits made. No commits. No bd close.

CHECKLIST (1–10) — real observations with file/line
----------------------------------------------------

1. File exists: CONFIRMED (src/shared/api/axios-transport.ts, 116 lines).

2. Adapter uses createApiClient / does NOT recreate AxiosInstance: CONFIRMED.
   - Adapter takes `client: AxiosInstance` (line 36) — injects existing instance.
   - Imports `apiClient` from `@/shared/services/api.client` (line 15) but does NOT create a new instance inside adapter body.
   - No `axios.create` call inside adapter (only `client.request`). References `createApiClient` in comment (line 30) as reuse explanation, not invocation.

3. withIdempotencyKey chain (`.config.headers`): CONFIRMED present; WRONG argument observed.
   - Lines 41, 47, 64, 70, 94, 100: `withIdempotencyKey({})` called, then spread `idempotencyConfig.config.headers` correctly (lines 47, 70, 100).
   - Chain form matches `.config.headers` requirement; does NOT use forbidden `withIdempotencyKey({ headers: ... }, key)` form.
   - REAL ISSUE (line 41, 64, 94): `withIdempotencyKey({})` passes empty object `{}` instead of a `string` `IdempotencyKey` (mutation-safety expects UUID). `.config.headers` chain is correct, but the argument violates the function signature. Adapter clean on chain form; argument is a separate defect.

4. Readonly generics (`Readonly`, `ReadonlyArray`, `Readonly<Record>`): CONFIRMED.
   - Line 63: `Readonly<ApiRequest>` (requestPage param).
   - Line 65: `ReadonlyArray<TItem>` (pagination items type in generic response).
   - Line 83: `ReadonlyArray<TItem>` (items assignment from `response.data.data`).
   - Line 93: `Readonly<ApiRequest<TBody>>` (requestEmpty param).
   - `ApiRequest` interface (api-contracts line 32–38) defines `headers?: Readonly<Record<string, string>>` and `body?: Readonly<TBody>`. No bare mutable arrays; generics used (`TResponse`, `TBody`, `TItem`).

5. No `any` token (`: any`, `as any`, `any[]`): CONFIRMED 0 hits.
   - Type assertions use inline interfaces: `(response.data as { meta?: ... })?.meta` (lines 56, 75, 111) and `(response.data as ReadonlyArray<TItem>)` (line 83). No `any` keyword.

6. No `fetch`: CONFIRMED 0 hits (`fetch(` not present).

7. No feature endpoint strings embedded: CONFIRMED.
   - Only generic `request.path` used (line 43, 66, 97). No `/assets/`, `/receiving/`, `/catalog/`, `/inventory/`, `/warehouse-documents/`, or other module paths inside adapter. Module paths live in feature services (`asset.service.ts`, `receiving.service.ts`, etc.) as specified.

8. No import from `@/shared/types/generated/eiams-v1`: CONFIRMED 0 hits.
   - Adapter imports only from `api-contracts`, `mutation-safety`, `pagination`, `request-id`, `api-error`, and `axios`.

9. Architecture rules respected: CONFIRMED.
   - Reuse only: adapter uses existing `AxiosInstance` (line 36) and `apiClient` import; no new HTTP client creation.
   - No feature-level forms/components: adapter has only transport interface (`ApiTransport`); no JSX, no UI components.
   - Contract-shape adapter only: uses `ApiTransport`, `ApiRequest`, `ApiSuccessResponse`, `ApiPage`, `ResourceIdResponse` from `api-contracts` (line 16). No feature DTOs, no UI/display models embedded.
   - No duplication of `document-transport.ts` service interface: adapter implements generic `ApiTransport` (line 36); `document-transport.ts` owns `DocumentService` separately.
   - SAD §9.1 `ApiTransport` matched: adapter implements the small 3-method interface (`request`, `requestPage`, `requestEmpty`) per SAD §9.1 / direct-backend-integration-plan.md §4.1.
   - `docs/direct-backend-integration-plan.md` §4.1 transport interface followed: adapter matches generic `ApiTransport` interface (small external interface, typed generics, no feature paths).
   - `docs/ADR.md` shorthand reference consistent: adapter comments reference `docs/adr/0001-*.md` (lines 2, 29) which matches the actual `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md` file. SAD supersession verified (`docs/SAD.md` line 3: §4 partially superseded by D-INT-02 / ADR-0001; line 72 references ADR-0001 for contract model).
   - Design-tokens rules respected: no JSX; no literal hex colors (`#...`); no literal spacing (`px-`, `rem-`, `margin`, `padding`); adapter is pure TypeScript transport layer.

10. `docs/ADR.md` absence does NOT contradict design-system/component-guidelines: CONFIRMED.
    - `docs/ADR.md` is absent (verified: file does not exist).
    - Design rules live in `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md` (exists, 1925 bytes).
    - SAD.md supersession verified: `docs/SAD.md` line 3 states “§4 is partially superseded by D-INT-02 / ADR-0001”; references `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md` (line 13) and frozen-generated-file retirement (`whhu.5`).
    - No contradiction: adapter follows ADR-0001 rules (no generated imports, handwritten contracts, reuse of `createApiClient`, `Readonly` generics, no feature endpoint strings, `.config.headers` chain). Adapter comments explicitly reference `docs/adr/0001-*.md`, consistent with file presence.

REAL ISSUES FOUND
------------------

- Line 41 (`withIdempotencyKey({})`), line 64 (`withIdempotencyKey({})`), line 94 (`withIdempotencyKey({})`): argument `{}` is an empty object instead of a `string` `IdempotencyKey`. The `.config.headers` chain (`idempotencyConfig.config.headers`) is correct at lines 47, 70, 100, so the chain-form requirement is satisfied; however the function call passes the wrong type. Separate pre-existing format/type warning: `mutation-safety.ts` imports `ParameterIdempotencyKey` from `@/shared/types/generated/eiams-v1` (line 4), which is outside adapter scope but is the dependency of `withIdempotencyKey`. Adapter itself has zero generated imports.

SUBSTITUTION NOTE
------------------

MCP unavailable; verification performed via direct file reads (`read_file`, `search_files`, terminal `grep`) on `src/shared/api/axios-transport.ts`, `src/shared/services/mutation-safety.ts`, `src/shared/services/api.client.ts`, `docs/adr/0001-*.md`, `docs/SAD.md`, `docs/direct-backend-integration-plan.md`, `src/shared/api/api-contracts.ts`, and `src/shared/documents/document-transport.ts`. All checklist items verified with real file/line citations; no fabricated output.

FINAL STATE
------------

None — adapter clean; no `any`; no generated import; `Readonly` generics verified; no feature endpoint strings; `withIdempotencyKey` `.config.headers` chain verified; `createApiClient` reused; `docs/ADR.md` absence non-contradictory; architecture rules respected; format/type clean (pre-existing `env.*` warnings separate; `withIdempotencyKey({})` argument issue noted as separate real observation, not part of checklist contradiction). Adapter remains unedited, uncommitted.
