# Backend contract reconciliation — evidence

**Status:** evidence record, 2026-09-29
**Why this file exists:** the provisional OpenAPI snapshot and the real
backend disagree in three places that no test could detect. This record was
produced by running the real backend and reading its source, after the
development proxy was made self-consistent (see §4).

**Beads:** `eiams-frontend-l0d6` (pagination), the P0 contract-drift bead
(error + pagination), `eiams-frontend-2j41` (wrong Arabic), `eiams-frontend-whhu.9`
(mis-specified allowlist).

---

## 1. Authoritative source

Read directly from the backend checkout
(`C:\EIAMS-SYSTEM\eiams-backend\src\Web.Api\Infrastructure\`):

- `ApiContracts.cs` — `ApiResponse<T>`, `ApiPagination`, `ApiResponseMeta`,
  `ResourceIdResponse`, `ApiErrorResponse`, `ApiError`
- `ApiResults.cs` — `ErrorFromStatusCode`, the canonical status→code table

Observed on the wire, independently, twice:

```json
{"success":false,"error":{"code":"USERS_INVALID_REFRESH_TOKEN",
 "message":"The provided refresh token is invalid or has expired",
 "details":{},"request_id":"75884cb3-8a52-4d6e-862e-347c857d92a9"}}
```

## 2. Real contracts

```csharp
public sealed record ApiResponse<T>(
    bool Success, T? Data, ApiPagination? Pagination, ApiResponseMeta Meta);

public sealed record ApiErrorResponse(bool Success, ApiError Error);

public sealed record ApiError(
    string Code, string Message, object Details,
    [property: JsonPropertyName("request_id")] string RequestId);

public sealed record ApiPagination(
    [property: Range(1, int.MaxValue)] int Page,                                  // "page"
    [property: Range(1, int.MaxValue)] [property: JsonPropertyName("page_size")] int PageSize,
    [property: JsonPropertyName("total_items")]      int? TotalItems,
    [property: JsonPropertyName("total_pages")]       int? TotalPages,
    [property: JsonPropertyName("has_previous_page")] bool HasPreviousPage,
    [property: JsonPropertyName("has_next_page")]     bool HasNextPage,
    [property: JsonPropertyName("total_count")]       int?  TotalCount,
    [property: JsonPropertyName("mode")]              string? Mode,
    [property: JsonPropertyName("next_created_at_utc")] DateTime? NextCreatedAtUtc,
    [property: JsonPropertyName("next_id")]           Guid? NextId);
```

**No** top-level `status`. **No** `titleAr` / `detailAr`. **No** `traceId`.
**No** `fieldErrors`. `message` is **English**. Codes are `UPPER_SNAKE_CASE`.

## 3. Three breaks in the frontend

### Break 1 — error normalization is entirely dead

`src/shared/services/api-error.ts`:

| Location | Requires | Real backend | Result |
| --- | --- | --- | --- |
| `problemFromPayload:141` | `payload['status'] === status`, top level | absent | always `null` |
| `fallbackApiError:127` | `payload['code']`, top level | nested at `error.code` | always `null` |
| `safeErrorCode:82` | `/^[a-z][a-z0-9._-]{0,127}$/u` | `UPPER_SNAKE_CASE` | always `null` |

Because `code` is always `null`, `fallbackFeedback` can never reach the
7-entry `AUTH_FEEDBACK` map at `api-error.ts:29-58`. **That map is dead code**,
and every error in the application collapses to generic `STATUS_FEEDBACK` text.

Observed in the browser: a failed login returned `404 USERS_NOT_FOUND` and the
user saw

> لم يتم العثور على البيانات المطلوبة.

instead of a login-specific message. The same mechanism would render
`REFRESH_TOKEN_ORIGIN_REJECTED` (403) as

> لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.

— a *permissions* message for what is an *origin* problem. That is the defect
class `eiams-frontend-2j41` describes, and its cause is Break 1, not an
origin allowlist.

### Break 2 — `fieldErrors` is never populated

The backend sends no `FieldError[]`. `Details` is an opaque `object` defaulting
to an empty dictionary. `setFormServerErrors`
(`src/shared/forms/server-errors.ts:34`) is used in **20 files** and can
therefore never map a server field error inline.

Whether validation detail is recoverable from `ApiError.Details` is **not
established**. It must be read off a real 400/422 before an adapter is written.
Do not guess the shape.

### Break 3 — the pagination wire contract is wrong

`ApiPagination` is **top-level**, a sibling of `data`, and **one-based**
(`Range(1, int.MaxValue)` → minimum 1), serialised as `page` / `page_size`.

`src/shared/api/pagination.ts` uses `WIRE_PAGE_FIELD = 'pageIndex'` /
`'pageSize'` and converts to **zero-based**, which the backend rejects at
binding time.

This:

- **confirms ruling R-003** — keep pagination top-level, do not move it into
  `data.pageInfo`;
- **supersedes** the provisional snapshot's `PageMeta { pageIndex, pageSize,
  … }` zero-based;
- **unblocks `eiams-frontend-l0d6`**, which recorded the field name and casing
  as unconfirmable. The migration itself is ~18 list pages and selectors that
  still pass `pageIndex` directly, plus
  `src/test/msw/warehouse-document-handlers.ts:119` and
  `src/test/msw/factories.ts:115`.

## 4. The origin gate (root cause of the 403)

The backend is a **deliberate same-origin-only** design:

- `CorsExtensions.cs:15` — `builder.SetIsOriginAllowed(_ => false)`, denying
  every origin, with a comment saying so.
- `SecurityConfigurationExtensions.cs:32-48` — throws at startup in **every**
  environment if `Cors:AllowedOrigins` **or**
  `Authentication:RefreshTokenTransport:AllowedCookieOrigins` has any non-blank
  entry. The message is an instruction: *"Serve browser API requests through
  the UI's same-origin /api/v1 proxy and leave … empty."*
- `RefreshTokenTransport.cs:99-105` — the real gate. `Origin` must equal
  `{scheme}://{Host}` **of the request itself**. `Sec-Fetch-Site: cross-site` is
  rejected outright at line 79.

The Vite dev proxy set `changeOrigin: true`, which rewrites `Host` to
`localhost:5000`, but `http-proxy` forwards `Origin` verbatim. The backend
therefore received an inconsistent request:

```
Host:   localhost:5000          ← rewritten by changeOrigin
Origin: http://localhost:5173   ← forwarded untouched
```

Fix (`src/config/vite-dev-server.ts`): a `configure` hook rewrites a
browser-supplied `Origin` to the target origin, and deliberately leaves a
request with **no** `Origin` untouched so non-browser callers keep the
"missing Origin is acceptable" path the backend grants them.

Verified end to end:

| Request | Before | After |
| --- | --- | --- |
| via proxy, `Origin: http://localhost:5173` | `403 REFRESH_TOKEN_ORIGIN_REJECTED` | `400 USERS_INVALID_REFRESH_TOKEN` |
| via proxy, no `Origin` | `400` | `400` (absence preserved) |

## 5. Architectural consequence — not a bug fix

The frontend was designed against D-AUTH-01 / D-OAS-01 on the assumption that
**the server supplies Arabic** (`ProblemDetails.titleAr` / `detailAr`). The
real backend supplies an **English** `message` and a machine code.

Arabic feedback must therefore become **frontend-owned**, keyed off
`error.code`. That inverts an approved decision. `SAD.md` §1 requires the
conflict to be recorded in the appropriate source and a decision obtained — it
is not a patch to be applied quietly.

`ApiResults.ErrorFromStatusCode` enumerates the codes needing deliberate
Arabic copy: `REQUEST_INVALID`, `AUTHENTICATION_REQUIRED`,
`AUTHORIZATION_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `METHOD_NOT_ALLOWED`,
`RESOURCE_CONFLICT`, `REQUEST_BODY_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`,
`UNPROCESSABLE_ENTITY`, `RATE_LIMIT_EXCEEDED`, `SERVER_FAILURE`,
`SERVICE_UNAVAILABLE`, `REQUEST_TIMEOUT`, `REQUEST_FAILED` — plus the
domain codes observed (`USERS_NOT_FOUND`, `USERS_INVALID_REFRESH_TOKEN`,
`REFRESH_TOKEN_ORIGIN_REJECTED`).

Auth codes must not reveal whether a username exists. The backend returns a
distinct `404 USERS_NOT_FOUND` for an unknown username, distinguishable from a
wrong-password response — a **username-enumeration oracle** that needs a
backend change to a uniform `401`.

## 6. Confirmed correct, no action

- `ResourceIdResponse(Guid Id)` matches the create-returns-id shape `whhu.13`
  was to author.
- `ApiResponseMeta` is `{ request_id, timestamp }`, which maps onto the existing
  `traceId` intent under a different name.
- Every proxied response carried `server: Kestrel`, an ASP.NET `x-request-id`
  UUID and `cache-control: no-store` — confirming genuine end-to-end integration
  rather than a fixture.

## 7. What this does NOT prove

- Nothing here ratifies a contract. `ApiContracts.cs` is authoritative for what
  the backend **emits**; a regenerated OpenAPI artifact is still required by
  `eiams-frontend-e01.7` before production, and `eiams-frontend-e26-t03`
  remains unspecified because `integration-readiness-checklist.md` is missing
  from the canonical document set (ruling R-004).
- The no-`Origin` branch is unreachable from a browser: per the fetch spec,
  `Origin` is sent on every request whose method is not GET/HEAD. It is
  exercised only by non-browser callers, so its evidence is the `curl` probe,
  not the browser QA pass.
- A successful authenticated login has **not** been demonstrated. There are no
  seeded development credentials, so the evidence stops at
  `USERS_INVALID_REFRESH_TOKEN` — which proves the origin gate passes and the
  request reaches token validation, and nothing more.

## 8. Two wire facts confirmed while adding role metadata concurrency (2026-10-04)

Established by `IntegrationTests.Api.RoleMetadataConcurrencyTests` against the
real API, not by reading source. Both are general, not role-specific, and both
constrain how frontend error handling must be written.

### 8.1 Error codes are UPPER_SNAKE_CASE on the wire

Domain code declarations use dotted PascalCase —
`Domain.Roles.RoleErrors.RowVersionMismatch` declares
`"Roles.RowVersionMismatch"` — but the error envelope publishes
`ROLES_ROW_VERSION_MISMATCH`. Any frontend error-copy table or `switch` keyed on
the dotted form will never match. The error table (bead `eiams-frontend-z1hs`)
must key on the UPPER_SNAKE form actually observed on the wire.

### 8.2 A missing required member yields `details.body`, not a field error

`[property: JsonRequired]` on a non-nullable value type rejects the request
during model binding, but the reported detail is **not** keyed by field name:

```json
{"success":false,
 "error":{"code":"REQUEST_VALIDATION_FAILED",
          "message":"...",
          "details":{"body":["The submitted value has an invalid format."]},
          "request_id":"..."}}
```

So a client that omits a required field learns only that the request was
rejected. The security property is intact — the value never silently defaults —
but the frontend **cannot point at the offending field** and must fall back to a
generic Arabic message. This matters for `expectedRowVersion` on
`PUT /admin/roles/{roleId}` and for `nameAr` on the role write paths. Compare
with a *type* mismatch on `allowedScopeTypes`, which **is** reported per field
(`details.allowedScopeTypes`), so the two failure modes are not shaped alike and
error handling cannot assume field-level detail is always available.

## 9. Role contract shape after Tranches A and B

Verified against the live API and the regenerated OpenAPI document
(`eiams-backend-v1.openapi.json`, 134 paths / 172 operations / 291 schemas).

| Field | Where | Required |
| --- | --- | --- |
| `nameAr` | role projection, session role DTO, create/update request bodies | yes |
| `rowVersion` | role projection (list, detail, and now the update result) | yes |
| `expectedRowVersion` | `PUT /admin/roles/{roleId}` request body | yes |

`Role.name` is the stable role code (`WH_MGR`), **not** a display label — see
[`role-arabic-label-contract-decision.md`](role-arabic-label-contract-decision.md)
(D-RBAC-03). A list response's `data` member is the array itself; pagination is
top level.

Two RESOLUTION-027 obligations are **not** yet met and remain open under
`eiams-frontend-718b`: role creation still returns `ResourceIdResponse{id}`
rather than the full projection (§17), and role reads do not yet expose dotted
`permissionCodes` (§15).
