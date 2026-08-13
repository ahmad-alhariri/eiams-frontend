# EIAMS Authentication, Session, and Active-Scope Contract Decision

**Status:** Approved frontend and provisional API contract decision  
**Decision ID:** D-AUTH-01  
**Version:** 1.0.1  
**Beads:** `eiams-frontend-e01-t03`  
**Decision date:** 2026-08-09  
**Amended:** 2026-08-11 (`eiams-frontend-e01.8`)

## Decision

EIAMS v1 uses a server-authoritative session with short-lived JWT access tokens
and rotating refresh tokens. The browser sends the access token as an HTTP
Bearer credential, but never persists either token in Zustand, TanStack Query,
Web Storage, IndexedDB, route state, or a URL. The refresh token is delivered
only as a host-only `Secure`, `HttpOnly`, `SameSite=Strict` cookie scoped to
`/api/v1/auth`; JavaScript cannot read or submit its value directly.

The authenticated session response is the sole frontend source for the current
user, available scopes, active scope, effective roles, and effective permission
codes. Authorization remains server-enforced on every request. The frontend
uses the same response only to hide inaccessible routes/actions and to avoid
presenting operations that the server will reject.

An active scope is a server session choice, not a client-authored header or
filter. `Enterprise`, `Site`, and `Warehouse` are the only v1 scope types.
`scopeId` is `null` for Enterprise and a UUID for Site or Warehouse, matching
PRD Schema v5.

## Problem being solved

The governing sources establish JWT access/refresh authentication, scoped RBAC,
and a protected shell, but they do not define token transport, session
hydration, active-scope selection, or effective-permission calculation. The
provisional OpenAPI also exposed refresh tokens to JavaScript and required an
Enterprise UUID, contradicting the SAD and PRD respectively. Leaving those
choices to individual pages would create token leakage, inconsistent scope
checks, cross-scope cache exposure, and incompatible API adapters.

## Governing evidence

| Source | Governing consequence |
| --- | --- |
| PRD Chapters 5 and 10 | RBAC is Role-to-Permission through `RolePermission`; `UserRoleScope` grants roles at Enterprise, Site, or Warehouse scope; Enterprise `scope_id` is nullable. User and Employee are separate identities. |
| PRD Chapter 12 prerequisite 1 | Every operation requires the relevant permission within the target warehouse scope. |
| SAD sections 7–9 and 12 | Protected routes check authentication; scope-aware server responses are authoritative; Axios owns one JWT/refresh boundary; sensitive tokens stay out of UI state and route parameters; `401` returns through the auth flow. |
| BDM D-BDM-01 | A user may have multiple scoped role assignments; permission/scope enforcement is server-authoritative. |
| D-OAS-01/D-OAS-02 | The contract must expose bootstrap, refresh/logout, effective scope and permission visibility without page-specific tokens or ad-hoc headers. |
| UI design section 4 | The application shell displays user identity, role context, logout, and the current site/warehouse scope. |
| AGENTS.md | Server data belongs to TanStack Query, Zustand is UI-only, and every route/menu/action is permission-gated. |
| OWASP HTML5 and Session Management guidance | Session identifiers must not be placed in Web Storage; Secure, HttpOnly, and SameSite cookie controls reduce browser token exposure. |
| RFC 9700 section 4.14 | Browser/public-client refresh tokens require replay protection through sender constraint or refresh-token rotation. EIAMS v1 selects rotation. |

External security references refine transport safety; they do not override EIAMS
business semantics.

Security references:

- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 9700 — Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700.html)

## Identity and authentication rules

1. `User` is the login identity. An optional Employee link supplies display
   context but never substitutes as an authentication subject.
2. The login request contains only `username` and `password`. Authentication
   failures use one generic Arabic-safe `401` problem response and never reveal
   whether the account is absent, inactive, suspended, or disabled.
3. The login password is a required credential with a minimum length of eight
   characters and a maximum length of 200 characters, matching
   `LoginRequest.password` in the OpenAPI snapshot. This is an input-shape
   invariant only: the frontend does not impose character-class, composition,
   reuse, or account-policy rules beyond the contract.
4. Account eligibility, password verification, throttling, and lockout are
   backend security responsibilities. The frontend does not infer them from
   locally cached user administration data.
5. Successful login returns an access-token response plus the complete session
   projection and sets the refresh cookie. The response body never contains a
   refresh token.
6. Access and refresh lifetimes are deployment/security configuration. The
   response exposes `expiresInSeconds`; the frontend contains no hard-coded
   token duration.

## Token and session lifecycle

| Operation | Authentication | Contract behavior |
| --- | --- | --- |
| `POST /auth/login` | Anonymous credentials | Returns access token + session; sets the rotating refresh cookie. |
| `POST /auth/refresh` | Refresh cookie | Takes no JSON token body; rotates the refresh token and returns a new access token + current session. Reuse of an invalidated refresh token revokes its token family. |
| `GET /auth/session` | Bearer access token | Returns the authoritative current session without minting tokens. |
| `PUT /auth/active-scope` | Bearer access token | Validates the requested scope against current assignments and returns the recomputed session. |
| `POST /auth/logout` | Optional refresh cookie/access context | Idempotently revokes the session/token family, clears the refresh cookie, and returns `204` even when the browser is already logged out. |

The refresh cookie is host-only; no `Domain` attribute is set. Production must
use HTTPS. The API validates allowed origins for cookie-mutating authentication
requests. Development uses the configured HTTPS proxy/origin and must not add a
Web Storage fallback.

The Axios session adapter performs at most one refresh attempt for an ordinary
API `401`. Concurrent failures share one in-flight refresh. It never refreshes
in response to a login or refresh failure and never loops. A failed refresh
clears the in-memory access token and authenticated caches, then returns the user
to the Arabic login route. `403` preserves the session and renders an
authorization failure; it is not treated as token expiry.

## Session projection

The contract-backed session contains:

- `user`: stable user identity and display data;
- `availableScopes`: deduplicated, currently effective scopes with server-owned
  Arabic display labels and hierarchy context;
- `scopeState`: `Selected`, `SelectionRequired`, or `Unavailable`;
- optional `activeScope`, present only when `scopeState = Selected`;
- `activeRoles`: the roles contributing permissions at the selected scope; and
- `permissionCodes`: a deduplicated set of exact backend permission codes for
  that active scope.

The frontend does not decode JWT claims to build this projection and does not
merge role assignments itself. Token claims are authentication inputs, not a UI
authorization model.

## Scope resolution and switching

1. Only currently effective `UserRoleScope` assignments participate. Expired,
   future, inactive-role, or otherwise invalid assignments are excluded by the
   server.
2. Enterprise scope has `scopeId = null`. Site scope uses the site UUID.
   Warehouse scope uses the warehouse UUID and includes its parent `siteId` in
   the read projection.
3. With exactly one available scope, the server selects it on login. With more
   than one, no scope is selected until the user chooses one. With none, the
   authenticated session has `Unavailable`, empty permissions, and no feature
   access; the UI shows a contact-administrator state rather than guessing a
   default.
4. For a selected Site, effective permissions are the union of applicable
   Enterprise and matching Site assignments. For a selected Warehouse, they
   are the union of applicable Enterprise, containing Site, and matching
   Warehouse assignments. For Enterprise, only Enterprise assignments apply.
   V1 has grants only; no client-side deny model is introduced.
5. The API revalidates the chosen scope and permissions on every protected
   operation. Selecting a scope never expands the assignments granted to the
   user.
6. Scope switching is serialized. On success, the frontend cancels in-flight
   scoped requests, removes protected/scoped query data, installs the returned
   session, and navigates to a safe permitted route if the current route is no
   longer allowed. It must not reuse cached warehouse/site data across scopes.
7. A rejected switch leaves the prior active session intact. `403` with
   `auth.scope_not_available` triggers session refetch so revoked assignments
   disappear immediately.

The exact route-to-permission vocabulary remains D-RBAC work in
`eiams-frontend-e01-t07`; this decision defines how effective codes arrive and
how they are scoped.

## Frontend state boundaries

| State | Owner | Persistence rule |
| --- | --- | --- |
| Access token | Shared auth/session adapter memory | Never persisted and never exposed through component props beyond the HTTP boundary. |
| Refresh token | Browser-managed HttpOnly cookie | Never readable by JavaScript. |
| Session projection | TanStack Query | Single authoritative query; invalidate/refetch after scope or role changes. |
| Auth lifecycle (`unknown`, `anonymous`, `authenticated`) | Minimal auth integration state | May be represented in the auth store; it must not duplicate user, roles, permissions, or scopes. |
| Active scope | Session projection | Never maintained as an independent persisted Zustand value. |
| Login form | React Hook Form + Zod | Password is cleared after completion/failure and never logged. |

Until hydration finishes, protected routes render a neutral loading boundary.
Anonymous routes do not flash the application shell. A session with
`SelectionRequired` renders the accessible scope-selection gate; `Unavailable`
renders an Arabic contact-administrator state. Return paths are internal route
identifiers only and must be validated to prevent open redirects.

## Error and revocation behavior

| Condition | HTTP/result | Frontend behavior |
| --- | --- | --- |
| Invalid login or non-authenticatable account | `401 auth.invalid_credentials` with generic Arabic message | Keep login visible; do not disclose account state. |
| Missing/expired access token | `401 auth.access_expired` or `auth.unauthorized` | Shared adapter attempts the single refresh flow where eligible. |
| Missing/expired/replayed refresh token | `401 auth.session_expired` | Clear authenticated state and protected query data; route to login. |
| Authenticated but permission missing | `403 auth.permission_denied` | Preserve session; show permission-safe feedback. |
| Requested scope not assigned/effective | `403 auth.scope_not_available` | Preserve prior scope, refetch session, show Arabic error. |
| Cookie-auth request from a disallowed origin | `403 auth.origin_denied` | Preserve no credential data, show safe failure, and do not retry. |
| Authenticated user has no effective scope | `200` session with `scopeState=Unavailable` | Block feature routes and show contact-administrator state. |
| Logout | Idempotent `204` | Clear token/caches locally even if the network response is lost. |

Raw tokens, passwords, cookie values, and authorization headers must never be
logged, placed in audit field diffs, included in error detail, or copied into
telemetry. Tabs must receive logout/scope invalidation signals without copying
token values through browser storage; the concrete synchronization mechanism is
owned by the session implementation task.

## Compatibility and OpenAPI impact

D-AUTH-01 requires a provisional contract version increment and these changes:

- remove `RefreshTokenRequest` and the response-body `refreshToken` field;
- add a cookie security scheme and refresh-cookie response header;
- make refresh bodyless and cookie-authenticated; make logout idempotent and
  capable of clearing the cookie without a valid access token;
- add `ScopeState`, `EffectiveRole`, and `NullableUuid` schemas;
- expose `activeRoles` and `permissionCodes`, and omit `activeScope` unless one
  is selected;
- permit `scopeId = null` only for Enterprise in session and switch payloads;
- distinguish user account status from generic reference-data status; and
- document the stable auth error codes above.

Backend ratification remains `eiams-frontend-e01.7`. Any incompatibility must
change the OpenAPI version/provenance and generated clients rather than creating
a handwritten frontend adapter.

### Amendment 1.0.1 — login password input validation

The previously deferred login-password input rule is resolved in favor of the
already-versioned OpenAPI contract: `LoginRequest.password` requires 8–200
characters. The snapshot already carries those exact bounds, so this amendment
does not alter its semantic version, checksum, or generated TypeScript output.
Future backend/API changes to either bound must follow the normal versioned
OpenAPI and provenance process before the frontend schema changes.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e08-t03` | One Axios/session adapter owns bearer injection, credentialed auth calls, single-flight refresh, and retry termination. |
| `e06-t01` | Generate and wrap only the D-AUTH-01 login/session/scope schemas and operations. |
| `e06-t02` | Store lifecycle state and in-memory access-token access only; do not duplicate the session projection. |
| `e06-t03` | Provide the Arabic accessible login form and generic credential failure. |
| `e06-t04` | Hydrate through refresh, implement revocation/logout, and clear protected caches. |
| `e06-t05` | Distinguish unknown, anonymous, authenticated-without-scope, and selected-scope route states. |
| `e06-t07`, `e07-t05` | Consume server-provided available/active scope and enforce cache isolation during switch. |
| `e01-t07`, `e06-t06` | Define and consume exact permission codes without changing D-AUTH-01 scope resolution. |
| `e22-t06` | Manage role-scope assignments; session responses remain the runtime effective projection. |
| `e24-t06`, `e26-t02` | Verify hierarchical scope, revocation, token non-persistence, refresh replay handling, and cross-scope data isolation. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Store access/refresh JWTs in `localStorage`, `sessionStorage`, IndexedDB, or Zustand persistence | Exposes durable bearer credentials to JavaScript/XSS and contradicts the SAD token-state boundary. |
| Return the refresh token in JSON and accept it in a request body | Forces JavaScript ownership of the long-lived credential and duplicates cookie/session concerns in the frontend. |
| Put scope IDs or permission arrays in client-controlled headers | Creates an ad-hoc authorization protocol and lets presentation state masquerade as authority. |
| Derive permissions by downloading all role assignments | Duplicates the server authorization engine and risks stale or over-broad grants. |
| Automatically prefer Enterprise or the broadest available scope | Violates least surprise and can expose data beyond the user's intended working context. |
| Treat every `401`/`403` as logout | Causes refresh loops and destroys valid sessions on ordinary authorization failures. |
| Keep protected query caches after a scope switch | Risks displaying data fetched under a different site or warehouse context. |

## Explicitly deferred backend/security parameters

Password complexity, failed-login throttling/lockout thresholds, access and
refresh lifetimes, idle/absolute session timeouts, signing-key rotation, and any
future MFA/SSO policy are not specified by the PRD. They are backend/security
deployment decisions, not frontend constants. `eiams-frontend-e01.7` must
ratify their contract effects, and the release security review must verify them
before production. Their absence does not block mock/type generation because
the frontend consumes server expiry metadata and generic problem codes.
