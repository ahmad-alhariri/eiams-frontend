# D-ORIG-01 — The same-origin browser contract is not configurable

**Status:** ratified 2026-09-29
**Supersedes:** nothing
**Superseded by:** nothing
**Re-specifies:** `eiams-frontend-whhu.9` (which had specified a mechanism this
decision rejects)
**Decided by:** human owner, on the recommendation of the `i4wx` finding
**Evidence:** `docs/backend-contract-reconciliation.md` §4

---

## 1. The problem this settles

`eiams-frontend-whhu.9` was written as:

> Configure exact allowed frontend origins for direct development and
> production. Development allows `http://localhost:5173` with credentials;
> production origins come from configuration. Never combine `AllowAnyOrigin`
> with credentialed cookies. Add preflight and forbidden-origin tests.

Implemented as written, **it would crash the API on startup.** The backend
throws in *every* environment if either origin list is non-blank. So a P0 bead
blocking the whole `vi65` chain specified a mechanism that cannot exist.

The underlying *intent* was sound and remains satisfied: *the browser must be
able to authenticate against the API in development, without weakening
credentialed-cookie security.* Only the mechanism was wrong.

## 2. Decision

**The EIAMS API is same-origin-only. Cross-origin browser access is not a
configurable property and no origin allowlist exists or will exist.**

The browser reaches the API exclusively through the UI origin's own
`/api/v1` proxy. In development that proxy is the Vite dev server; in
production it is the HTTPS reverse proxy terminating on the same host. Both are
deployment facts, not application configuration.

## 3. Why this is stronger than the mechanism it replaces

| | Allowlist (as originally specified) | Same-origin-only (this decision) |
| --- | --- | --- |
| Misconfiguration | **fails open** — a typo or `*` grants an unintended origin | **fails closed** — the API refuses to start |
| Who can weaken it | any config editor, in any environment | requires a deliberate, reviewed code change to `CorsExtensions.cs` *and* removing the startup guard |
| Cross-origin credentialed cookies | possible if misconfigured | structurally impossible; `Sec-Fetch-Site: cross-site` is rejected before any origin comparison |
| Drift | a list must be updated per environment and kept in sync with hosting | nothing to keep in sync |

An allowlist creates a permanent thing to get wrong. This decision removes it.

## 4. What enforces it

| Layer | Mechanism | Location |
| --- | --- | --- |
| CORS | `SetIsOriginAllowed(_ => false)` — every origin denied, no `Access-Control-Allow-Origin` ever emitted | `CorsExtensions.cs:15` |
| Startup | throws if `Cors:AllowedOrigins` **or** `Authentication:RefreshTokenTransport:AllowedCookieOrigins` is non-blank, in **every** environment | `SecurityConfigurationExtensions.cs:32-48` |
| Refresh cookie | `Origin` must equal `{scheme}://{Host}` **of the request itself**; `Sec-Fetch-Site: cross-site` rejected outright | `RefreshTokenTransport.cs:28-39, 76-106` |
| Frontend dev proxy | rewrites a browser-supplied `Origin` to the target so the request is self-consistent; leaves a request with no `Origin` alone | `src/config/vite-dev-server.ts` |

## 5. Verification (live backend, 2026-09-29)

| Probe | Result | Meaning |
| --- | --- | --- |
| Cross-origin preflight `OPTIONS /health/live`, `Origin: https://untrusted.example` | `204`, **no** `Access-Control-Allow-Origin` | browser will block the real request |
| Cross-origin `GET /health/live` | `200`, **no** `Access-Control-Allow-Origin` | response carries no grant |
| Cross-origin `POST /auth/refresh`, `Sec-Fetch-Site: cross-site` | **`403`** | forbidden origin rejected |
| Same-origin `POST /auth/refresh` | **`400` `USERS_INVALID_REFRESH_TOKEN`** | origin gate **passed**; reached token validation |
| Same-origin `GET /health/live` | `200` | ordinary same-origin traffic unaffected |

The same-origin 400 is the decisive row: the origin gate accepts, and the
request fails only because no refresh cookie was presented.

These mirror assertions the backend already makes in
`tests/IntegrationTests/Security/SecurityConfigurationValidationTests.cs` and
`SecurityHardeningTests.cs` — notably
`Development_Should_RejectCrossOriginBrowserAllowList`, which sets
`Cors:AllowedOrigins:0 = http://localhost:5173` and asserts the **throw**, and
`SameOriginBrowserMatrix_ShouldAllowRefreshAndRejectCrossOriginCsrf`, which
asserts the preflight omits `Access-Control-Allow-Origin`.

## 6. Consequences

1. **`whhu.9` is re-specified as verification, not configuration.** The
   control already exists and is already tested; the bead's value is in
   confirming it stays.
2. **The frontend must never emit an origin grant.** A source guard now fails
   the build if `Access-Control-Allow-Origin` or an origin-allowlist variable
   ever appears in `src/`. This is the half of the contract this repository
   owns, and it was previously unenforced.
3. **The dev proxy is load-bearing for authentication, not a convenience.**
   It must present a self-consistent request. This is now tested
   (`src/config/vite-dev-server.test.ts`, 21 tests).
4. **The dev proxy target is `http://localhost:5000`.** Port 8080 is the local
   PostgreSQL instance, not the API.
5. **Production still needs explicit `AllowedHosts`.** That guard is separate,
   unchanged, and still enforced outside Development/Testing.

## 7. What this decision does NOT do

- It does not weaken anything. No guard is removed and no origin is added.
- It does not verify the backend test suite passes. Those tests were read, not
  executed here; the live probes in §5 are the runtime evidence.
- It does not ratify a contract. `eiams-frontend-e01.7` still owns ratification.
- It says nothing about a non-browser service-to-service caller, which is
  unaffected: a request with no `Origin` header is treated as an acceptable
  non-browser caller and the allowed-empty allowlist is correct for it.
