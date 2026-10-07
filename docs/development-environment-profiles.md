# RESOLUTION-040 — Development environment profiles

Two mutually exclusive development profiles exist. **Real backend integration is
the default**, and a fixture-backed UI sandbox is an explicit opt-in that the
shell marks visibly.

This is the fix for a specific, documented failure mode: the development
authentication bypass used to default to `true`, so turning mocks off did **not**
prove the real authentication flow. A developer could open a fully
fixture-authenticated UI and read it as evidence that login, refresh,
authorization and session hydration work. `CONFLICT-RESOLUTION-REVIEW-REPORT.md`
§6.5 and §7.5 confirm the old defaults were wrong and name
`src/config/env.ts`, `src/config/vite-dev-server.ts` and
`src/shared/services/dev-session.ts` as the files that carried them.

> **Update (`eiams-frontend-m4jm`, EPIC G7).** The `ui-sandbox` profile used to
> have two independent halves: an MSW browser worker (`VITE_ENABLE_API_MOCKS`,
> `src/mocks/`) and the auth bypass. The mock half is **gone** — the flag is
> retired and `src/mocks/` is deleted. The sandbox is now the auth bypass alone,
> and nothing below describes a running MSW worker as a current capability.

## The two profiles

| Profile       | `VITE_AUTH_BYPASS` | What it can prove                |
| ------------- | ------------------ | ------------------------------- |
| `real-backend`| `false` (default)  | genuine integration             |
| `ui-sandbox`  | `true`             | UI work only — **not** evidence |

The flag is off unless set. Only the literal strings `true` and `false` are
accepted; `1`, `TRUE` and `yes` fail loudly on startup rather than silently
selecting a profile.

## What the fixture does

- **authBypass** — `/auth/refresh` returns a fixture session.

When it is active the app is answering for itself, so `environment.uiSandbox`
is true and drives the shell marker. (It used to be the disjunction with
`environment.enableApiMocks`; with that flag retired it is simply `authBypass`.)

The deleted mock half was never interchangeable with this one, which is why
removing it did not make the sandbox weaker. `src/mocks/handlers.ts` served
exactly one auth route — `POST /auth/logout` (204) — and had **no**
`GET /auth/session` and no `POST /auth/refresh` handler. Mocks alone therefore
could not sign you in: the session was always produced client-side by
`authBypass`. Two flags were needed only because the mock half existed at all.

## Running the sandbox

Nothing to generate. `public/mockServiceWorker.js` is not in this repository and
the code that would have started it no longer exists, so there is no prerequisite
to run and no missing-prerequisite failure to document.

## Safety rules

1. **A production build refuses to boot** with the fixture flag enabled. A
   fixture surviving into production would answer real requests with canned data
   and bypass the host-only refresh cookie, so `parseEnvironment` throws rather
   than booting. RESOLUTION-040 requires the sandbox be unable to enter a
   production artifact or configuration. Since `eiams-frontend-m4jm` this guard
   reads `VITE_AUTH_BYPASS` alone; the `VITE_ENABLE_API_MOCKS` half it used to
   name is gone, and the artifact half of the same rule is enforced by
   `src/test/production-artifact-purity.test.ts` on real build output.
2. **The proxy target is server-only.** `EIAMS_DEV_PROXY_TARGET` is deliberately
   not `VITE_`-prefixed so the backend origin cannot reach the browser bundle.
3. **The browser stays same-origin.** `VITE_API_BASE_URL` must be an
   origin-relative path, so the host-only refresh cookie works without CORS.

## The visible marker

`src/shared/ui/ui-sandbox-notice.tsx` renders a warning bar above the header:

> بيئة الاختبار — البيانات لا تأتي من الخادم الحقيقي

It names each active fixture, uses `role="status"` with `aria-live="polite"` so
it is announced once rather than interrupting, and **renders nothing when no
fixture is active**. The component is pure — it takes the fixture list as a prop
and holds no environment knowledge — so the profile decision stays in
`@/config/env`, where it is validated and production-checked.

## What changed

### Original change (RESOLUTION-040)

| File | Change |
| --- | --- |
| `src/config/env.ts` | `VITE_AUTH_BYPASS` added to the validated schema (default `false`); mocks default flipped to `false`; new derived `uiSandbox`; production guard |
| `src/config/vite-dev-server.ts` | `DEFAULT_DEV_API_PROXY_TARGET` `8080` → `5000` |
| `src/shared/services/dev-session.ts` | `isDevAuthBypassEnabled` reads the validated `environment.authBypass` instead of raw `import.meta.env` defaulting to on |
| `src/shared/services/api.client.ts` | updated call site |
| `src/shared/ui/ui-sandbox-notice.tsx` | **new** — pure visible marker |
| `src/shared/layout/app-layout.tsx` | mounts the marker above the header |
| `.env` / `.env.example` | real-backend defaults; one canonical two-profile table |

`isDevAuthBypassEnabled` used to take a second raw-`import.meta.env` argument
and default to `true`. A profile flag read outside the validated schema is a
second, weaker source of truth that can drift from the one the app actually
booted with; it now reads the same validated object.

### `eiams-frontend-m4jm` (EPIC G7) — mock half retired

| File | Change |
| --- | --- |
| `src/mocks/` (5 files) | **deleted** — `browser.ts`, `handlers.ts`, `db.ts`, `handlers.test.ts`, `inventory-count-state.ts` |
| `src/config/env.ts` | `VITE_ENABLE_API_MOCKS` removed from the schema and from `AppEnvironment`; `uiSandbox` is now `authBypass` alone; the production guard still throws, on `authBypass` alone |
| `src/app/boot.tsx` | the MSW worker start, `DEV_ONLY_START_MOCKS` and the `startMocks` seam are gone; the failure screen, the try/catch and the missing-root path stay |
| `src/shared/layout/app-layout.tsx` | `SANDBOX_FIXTURES` can only contribute `authBypass` |
| `.env.example` | one-column profile table |
| `src/test/no-runtime-test-imports.test.ts` | now green — the last two offenders were `src/mocks/db.ts` and `src/mocks/handlers.ts` |

Deliberately **kept**: `src/test/msw/` in full (the harness is test-only, and ~150
test files import it), `src/shared/services/dev-session.ts`,
`src/shared/ui/ui-sandbox-notice.tsx`, and the `SANDBOX_FIXTURES` list in
`app-layout.tsx`.

## Browser QA evidence

Verified with Chrome DevTools MCP against both profiles.

> **Superseded in part (2026-10-01, `eiams-frontend-etf7`).** The **sandbox**
> evidence below was collected while `public/mockServiceWorker.js` was still
> committed, and it is no longer reproducible from a clean checkout: the worker
> script is gone, so a fresh sandbox showed the failure screen described above
> until `npx msw init public --save` was run. The observation is kept as evidence
> of what the sandbox *did* prove, and as the reason the worker was removed — it
> is not a claim about the current tree. The **real-integration** evidence is
> unaffected and still holds: nothing about it depended on the worker.
>
> **Superseded in whole (2026-10-01, `eiams-frontend-m4jm`).** Even that
> reproduction path is now gone: there is no `npx msw init` prerequisite because
> there is no worker to start. **No new browser QA was run for this change, and
> none is claimed.** What replaced the sandbox claim is mechanical, not visual:
> `vite build` emits no chunk containing `setupWorker`, `msw/passthrough` or a
> seed value, and no `mockServiceWorker.js` reaches the outDir —
> `src/test/production-artifact-purity.test.ts` asserts both on real bytes. The
> auth-bypass half of the sandbox is unchanged by this work and its marker
> (`الجلسة التجريبية`, `role="status"`, `aria-live="polite"`) still stands as
> last observed, on the real-integration run below and the earlier sandbox run.

**Real-integration profile** — notice absent, no session, no MSW worker, no
service-worker controller, and no cookie/localStorage/sessionStorage state. The
refresh request reached a real Kestrel backend
(`POST /api/v1/auth/refresh` → `403`), which is the honest signal that no
fixture answered. Previously this page rendered a complete logged-in dashboard.

**Sandbox profile** (predates both the worker removal and the mock-layer
deletion; no longer reproducible) — notice visible with `role="status"`,
`aria-live="polite"`, correct Arabic text, and both fixtures named
`(بيانات تجريبية، جلسة تجريبية)`; `[MSW] Mocking enabled` and
`[dev] Auth bypass active` in the console; `mockServiceWorker.js` controlling
the page; notice above the header (`top:0 h:32`, header `top:32`); `dir=rtl`
intact with the sidebar on the right; `pointer-events` intact and nothing
interactive overlapped.

That sandbox run is also what proved the second half of the story: in a
**production** build of the same commit, nothing activated the worker
(`getRegistrations()` → 0, `controller` → none), yet
`fetch('/mockServiceWorker.js')` returned 200. Inert in the running app,
present on the server. `src/test/production-artifact-purity.test.ts` now asserts
both facts — no fixture code in any chunk, and no `mockServiceWorker.js` in the
outDir — so the second one can no longer regress unnoticed.

## The two known sandbox gaps, and what happened to them

1. **The mock layer was a production build away from the bundle.** Until
   `eiams-frontend-etf7`, `bootstrapApplication` resolved its mock start from a
   destructuring default parameter, which statically referenced
   `import('@/mocks/browser')` on every path, so a 517 kB `browser-u-*.js` chunk
   carrying `setupWorker` and the seed document `EIAMS-CNT-2026-0001` shipped to
   production. `import.meta.env.DEV` is replaced at build time, but only if the
   reference sits behind it — a runtime `environment.isDevelopment` check is not
   a build-time switch. The gate is
   `src/test/production-artifact-purity.test.ts`, which builds for real and reads
   the emitted bytes; it is still that test's job, and the leak it was written
   for cannot recur because the module it named no longer exists.
2. **The mock handlers imported from the test tree.** `src/mocks/handlers.ts`,
   `src/mocks/db.ts` and `src/app/gallery/demos/document-detail-demo.tsx`
   imported `@/test/msw/**`. The gallery half was fixed in
   `eiams-frontend-vs8p`; the other two are **resolved by deletion** in
   `eiams-frontend-m4jm`. `src/test/no-runtime-test-imports.test.ts` — the rule
   the epic states ("no file under `src/` outside `src/test/` imports
   `@/test/**`") — is now **green**, with its two remaining offenders resolved
   rather than allowlisted.

## Two defects the QA run surfaced, both recorded rather than fixed here

- `eiams-frontend-2j41` — `403 REFRESH_TOKEN_ORIGIN_REJECTED` renders the
  permission-denied Arabic message, so a mistyped password is reported as
  lacking permission. Pre-existing, but it undercuts the honesty goal. The
  backend origin allowlist also rejects the Vite dev origin, so the real profile
  cannot yet demonstrate a successful login.
- RESOLUTION-039's fail-closed CORS and this profile work meet there: the backend
  currently allows `AllowAnyOrigin` in Development when the list is empty, which
  is the opposite of the approved behaviour.

## Follow-up

Once a real backend accepts the Vite dev origin, the real-integration profile
becomes the default developer experience and the sandbox is opt-in for UI work
only. Gate evidence for release readiness is tracked by `eiams-frontend-e26-t06`
and must show the fixture flag off.
