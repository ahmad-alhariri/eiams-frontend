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

## The two profiles

| Profile       | `VITE_ENABLE_API_MOCKS` | `VITE_AUTH_BYPASS` | What it can prove                |
| ------------- | ----------------------- | ----------------- | ------------------------------- |
| `real-backend`| `false` (default)       | `false` (default) | genuine integration             |
| `ui-sandbox`  | opt-in                  | opt-in            | UI work only — **not** evidence |

Both flags are off unless set. Only the literal strings `true` and `false` are
accepted; `1`, `TRUE` and `yes` fail loudly on startup rather than silently
selecting a profile.

## What each fixture does

- **mocks** — MSW replaces HTTP with a browser worker.
- **authBypass** — `/auth/refresh` returns a fixture session.

Either one means the app is answering for itself, so `environment.uiSandbox` is
their disjunction and drives the shell marker.

## Safety rules

1. **A production build refuses to boot** with either flag enabled. A fixture
   surviving into production would answer real requests with canned data and
   bypass the host-only refresh cookie, so `parseEnvironment` throws rather than
   booting. RESOLUTION-040 requires the sandbox be unable to enter a production
   artifact or configuration.
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

## Browser QA evidence

Verified with Chrome DevTools MCP against both profiles.

**Real-integration profile** — notice absent, no session, no MSW worker, no
service-worker controller, and no cookie/localStorage/sessionStorage state. The
refresh request reached a real Kestrel backend
(`POST /api/v1/auth/refresh` → `403`), which is the honest signal that no
fixture answered. Previously this page rendered a complete logged-in dashboard.

**Sandbox profile** — notice visible with `role="status"`,
`aria-live="polite"`, correct Arabic text, and both fixtures named
`(بيانات تجريبية، جلسة تجريبية)`; `[MSW] Mocking enabled` and
`[dev] Auth bypass active` in the console; `mockServiceWorker.js` controlling
the page; notice above the header (`top:0 h:32`, header `top:32`); `dir=rtl`
intact with the sidebar on the right; `pointer-events` intact and nothing
interactive overlapped.

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
and must show both flags off.
