# Frontend security review

**Status:** Complete - two defects found and fixed, six controls verified, two observations recorded
**Bead:** `eiams-frontend-e26-t02` (P1, parent `vi65.13` G6 - quality hardening, accessibility, RTL and release readiness)
**Date:** 2026-10-28
**Reviewed tree:** `eiams-frontend`, branch `feature/assets-custody-hardening`, HEAD `240c050`
**Reviewed backend:** `http://127.0.0.1:5000` (Docker image `eiams-web-api:ic-be-5`), PostgreSQL `eiams-local-pg`

## Why this review exists

`e26-t02` is a release-readiness deliverable, not a feature. The frontend was
about to be shipped against a real backend, and the only automated evidence
exercising it was an MSW suite that served the same fiction the services
assumed. The P0 contract-smoke suite (`eiams-frontend-69yr`) now proves the
wire contract against a live backend, but it proves the SHAPE. This review asks
the two questions that shape does not answer: can anyone get somewhere they
should not, and is the security story the app tells itself actually true?

## Method - two axes

**Axis 1 - SECURITY.** "Can an attacker who controls the browser, the network
or a dependency reach something they should not?" Each control below was
verified by reading the source AND, where the answer depends on runtime
behaviour, by measuring the running system.

**Axis 2 - SPEC / EVIDENCE.** "Is the claim the code makes actually true, and is
the evidence offered for it honest?" A control that passes only because a mock
asserts it is not a control.

Every finding records what was measured, not what was assumed. Negative
results are reported as negative results.

## Findings

| ID | Axis | Severity | Finding | Disposition |
| --- | --- | --- | --- | --- |
| S1 | Security | - | CSRF is structurally mitigated by the refresh cookie's path | no defect |
| S2 | Security | - | No DOM-XSS sink, no web-storage credential store, no open redirect, no message channel | no defect |
| S3 | Security | - | The bearer token and the login password are never logged | no defect |
| S4 | Security | - | The dev auth bypass is double-locked and test-pinned | no defect |
| S5 | Security | - | No user-enumeration oracle, by response or by timing | no defect |
| S6 | Security | Medium | The chrome error fallback rendered the raw error message into the UI | **fixed** |
| S7 | Security | Medium | The `shadcn` CLI was a production dependency | **fixed** |
| S8 | Security | Informational | 99 advisories, none of them in the shipped browser bundle | recorded |
| O1 | Spec | Low | The bootstrap failure screen renders a raw technical dump by design | recorded, deliberate |
| O2 | Spec | Low | Tailwind build-time packages sit in `dependencies` | recorded, not a security finding |

## The two defects, in detail

### S6 - the chrome error fallback rendered an arbitrary error message

**Defect.** `src/shared/layout/app-chrome-boundary.tsx` rendered
`{error.message}` into the Arabic fallback bar. The shared
`src/shared/feedback/error-boundary.tsx` deliberately does the opposite: its
default fallback renders a static Arabic `ErrorState` plus a retry button and
never renders an error's text. The chrome boundary overrode that safety
contract through the `fallback`-as-function prop.

**Why it matters.** An arbitrary thrown error's message is implementation
detail, and in a JavaScript runtime it is frequently English. Rendering it puts
internal text into an Arabic-only interface, and it is exactly the shape that
turns an internal detail into user-visible text the moment a component throws
something other than a render error.

**Fix.** The raw span was removed. The Arabic sentence and the retry button
are unchanged, and the error is still logged to the console for developers
through the existing `onError` callback. The fallback's first parameter is now
`_error`.

**Revert-proof.** `src/shared/layout/app-chrome-boundary.test.tsx` previously
ASSERTED the raw message was rendered. That assertion was inverted to
`expect(alert).not.toHaveTextContent('header exploded')`, so the test now pins
the security property. Restoring the production change makes the test fail.

### S7 - the `shadcn` CLI was a production dependency

**Defect.** `shadcn` was listed in `dependencies`. It is a build-time CLI used
by exactly three scripts - `ui:info`, `ui:add:dry` and `ui:add` - and it is
never imported by application code. As a production dependency it dragged
`express` -> `proxy-addr` (the only CRITICAL advisory in the audit) and
`@modelcontextprotocol/sdk` into every production install.

**Why it matters.** A build tool in the production dependency graph widens the
install surface of the shipped artifact for no runtime benefit, and it is the
sole reason a CRITICAL advisory appears under `pnpm audit --production`.

**Fix.** `shadcn` moved to `devDependencies` and `pnpm-lock.yaml` was
regenerated with `pnpm install --lockfile-only`. The lockfile diff is minimal:
2 files changed, 4 insertions, 4 deletions - the placement change only, with
no version churn - so `pnpm install --frozen-lockfile` stays satisfied.

**Evidence.** After the move, `pnpm audit --production` no longer reports the
`proxy-addr` critical. The remaining `fast-uri` highs are the lockfile-only
family described in S8.

**Test.** `src/test/shadcn-configuration.test.ts` asserted that `shadcn` was
present in `dependencies`, so it pinned the defect. That assertion was moved to
a `devDependencies` assertion, which pins the correct placement instead.

## Controls verified (Axis 1)

### S1 - CSRF is structurally mitigated by the cookie path

Measured live, `POST http://127.0.0.1:5000/api/v1/auth/login`:

```
eiams_refresh_token=...; expires=Wed, 04 Nov 2026 20:01:22 GMT; path=/api/v1/auth; samesite=strict; httponly
```

The decisive attribute is `path=/api/v1/auth`, not `SameSite`. The refresh
cookie is scoped to the auth path, so it is never sent to a business endpoint.
Business endpoints authenticate with the `Authorization: Bearer` header, which
a browser never sends ambiently. `SameSite=Strict` and `HttpOnly` are the
second layer, and the backend's origin check defends the auth endpoints that
do receive the cookie: a foreign `Origin` is answered `403
REFRESH_TOKEN_ORIGIN_REJECTED` (measured live), a code the frontend already
carries at `src/shared/api/error-copy-ar.ts:38`.

The one real weakness is that `Secure` is false outside Production. That is a
backend transport concern and is already tracked as `eiams-frontend-vi65.15`.

### S2 - no XSS, storage, redirect or message-channel surface

Swept across the production source tree: `dangerouslySetInnerHTML`,
`.innerHTML`, `.outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`,
`new Function(`, `localStorage`, `sessionStorage`, `javascript:`,
`target="_blank"`, `postMessage`, `window.open`, `location.href=`,
`location.assign`, `location.replace`, `srcDoc`, and `window.*` assignments -
**no matches**. The single `document.cookie` occurrence is a comment
explaining that the refresh cookie is HttpOnly and therefore unreadable.

### S3 - no credential logging

Four production `console.*` calls exist and all are benign: two bootstrap
messages, one chrome render message, and one dev-only notice about the auth
bypass. The API client never logs an axios error - which matters, because an
axios error serialises `config.headers.Authorization` (the bearer token) and
`config.data` (the login password). No production code path logs either.

### S4 - the dev auth bypass is double-locked

`src/config/env.ts` throws on a production build whose
`VITE_AUTH_BYPASS` is enabled, and `src/shared/services/dev-session.ts`
requires development mode as well. Both locks are pinned by tests that fail if
the lock is removed.

### S5 - no user-enumeration oracle

A known user with a wrong password and an unknown user both answer the
identical `404 USERS_NOT_FOUND` - same status, same code. The backend also
compares against a `DummyPasswordHash` whose comment states it exists to
equalize the work performed for an unknown account and a wrong password, so
the timing channel does not distinguish them either.

### S8 - no advisory reaches the shipped bundle

`pnpm audit` reports 99 advisories in the lockfile graph (1 critical, 38
high, 50 moderate, 10 low) and `pnpm audit --production` reports 77. The
built bundle is the decisive measurement, not the lockfile: the built
`dist/assets` contains **0** occurrences of `Ajv`, `fast-uri`, `proxy-addr` or
`express`. Every one of the 42 `@hookform/resolvers` imports in the app is the
`/zod` subpath, and each of its dist variants has 0 `ajv` references - so the
`ajv` and `fast-uri` families are lockfile-only. After the S7 fix the
critical advisory is gone from the production graph as well.

## Observations (Axis 2)

**O1 - the bootstrap failure screen shows a raw technical dump.** It renders
the error detail in a `dir="ltr"` block beside Arabic copy. This is
deliberate: the screen only appears when the app cannot boot, the error is a
render error and can never be an API error, and the detail is what a developer
needs. The Arabic-only copy rule is relaxed here by design.

**O2 - Tailwind's build-time packages are in `dependencies`.** `@tailwindcss/vite`
and `tailwindcss` are build-time only, like `shadcn` was. No advisory is
attached to them, so this is a hygiene observation rather than a security
finding, and it was left alone rather than widening the diff.

## What was deliberately not fixed

| Item | Why not | Tracked as |
| --- | --- | --- |
| `Secure` false on the refresh cookie outside Production | backend transport concern; production already sets it | `eiams-frontend-vi65.15` (P2, open) |
| Tailwind build-time packages in `dependencies` | no advisory; hygiene only | recorded here (O2) |
| The raw dump on the bootstrap failure screen | deliberate developer affordance | recorded here (O1) |

## Revert-proofs

| Fix | Proof |
| --- | --- |
| S6 | `expect(alert).not.toHaveTextContent('header exploded')` in `app-chrome-boundary.test.tsx` fails when the production span is restored |
| S7 | `pnpm audit --production --json` reports 1 `proxy-addr` advisory when `shadcn` is put back in `dependencies`, and 0 when it is restored |

## Handoff

The frontend's security posture is sound on the controls this review could
test: no XSS sink, no credential in storage or in logs, no CSRF path, no
enumeration oracle, no debug hooks, and a dev bypass that cannot be enabled
in a production build. The two defects found were both hygiene-class, and
both are now fixed with the evidence recorded above. The remaining risk in
this area is the backend's `Secure` flag and the human-Arabic error-copy
backlog, neither of which the frontend can close.
