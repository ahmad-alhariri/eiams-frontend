# EIAMS Frontend Operations and Deployment Runbook

**Owner:** Frontend release owner, with the platform and backend/API owners  
**Scope:** The static EIAMS frontend artifact and its same-origin hosting boundary  
**Status:** Ready for release-candidate operations; production API integration remains gated by `eiams-frontend-e01.7`.

## 1. Release authority and hard stop

This runbook does not authorize a production release by itself. A release owner
may promote an artifact only when the following evidence is recorded against the
commit SHA:

1. `pnpm install --frozen-lockfile` completed with the committed pnpm 11.20.0
   lockfile.
2. `pnpm run contract:validate` passed, including the contract checksum,
   Redocly, reference audit, and deterministic generation evidence.
3. `pnpm run quality` passed: generated types are current, lint, typecheck,
   formatting, Vitest, and the production build all succeed.
4. The GitHub **Frontend Quality** run for the promoted commit is green.
5. The backend/API owner has closed `eiams-frontend-e01.7`, recording
   ratification of the OpenAPI snapshot, authorization, validation, status
   codes, and payload compatibility.

Do not bypass a failed check by editing generated types, accepting an unversioned
Apidog export, or changing a frontend DTO to match an unratified backend.

## 2. Deployment contract

The deployable output is `dist/`, created by `pnpm run build`. It is a static
single-page application with hashed assets under `dist/assets/`. Its source maps
are disabled for production output, and `/dev/gallery` is absent from production
bundles.

The hosting/platform owner must configure the following, recording the final
host and configuration revision in the release evidence:

- Terminate HTTPS on the same public origin that serves the frontend.
- Proxy `/api/v1` to the EIAMS API before applying the SPA fallback. API errors,
  `401`, and `403` responses must remain API responses; they must never be
  rewritten to `index.html`.
- Serve `index.html` for valid client-side application paths so browser refresh
  and deep links work, while returning the application not-found view for
  unknown client paths.
- Cache hashed files in `dist/assets/` as immutable release assets; revalidate
  `index.html` so a rollback or new release can select a new asset manifest.
- Apply the organization-approved security headers, origin policy, observability
  configuration, and retention policy at the hosting/API boundary. Do not add
  undocumented frontend security headers or telemetry endpoints in this task.

## 3. Environment and credential boundary

`VITE_API_BASE_URL` is the only browser-visible runtime setting in this release.
It must be an origin-relative path such as `/api/v1`; it must not contain an
absolute host, query string, fragment, credentials, tokens, cookie values, or
other secrets. Build the selected value into the reviewed artifact from a
release-specific environment source, not from an operator's local `.env.local`.

Authentication depends on the approved D-AUTH-01 boundary:

- access tokens are memory-only;
- the refresh credential is a host-only `Secure`, `HttpOnly`, `SameSite=Strict`
  cookie scoped to `/api/v1/auth`;
- HTTPS and the same-origin proxy are required for that cookie flow; and
- token lifetimes, CORS/origin allowlists, signing-key rotation, upload
  allowlists/limits, audit retention, and redaction rules remain backend/security
  deployment decisions. Record their backend-owner approval; never hard-code
  them in the frontend.

Never attach screenshots, browser-storage exports, request headers, passwords,
JWTs, refresh cookies, or raw `ProblemDetails` payloads to a release record,
ticket, log, or telemetry event.

## 4. Promotion procedure

1. Select the immutable commit SHA and verify its green GitHub quality run.
2. Run the two release checks in section 1 from a clean checkout; retain command
   output and artifact checksum as release evidence.
3. Publish only the resulting `dist/` artifact. Do not rebuild an already
   approved release on another workstation without repeating the checks.
4. Configure the platform according to section 2 and confirm the deployed
   `VITE_API_BASE_URL` remains origin-relative.
5. Perform the smoke checks below with an approved, least-privileged UAT account
   after OpenAPI/backend ratification. Record only outcome, time, environment,
   role, and trace/correlation identifiers when the API supplies them.
6. Announce the release only after smoke evidence is complete. If a check fails,
   stop promotion and use the incident procedure instead of retrying a
   document-posting action.

## 5. Post-deploy smoke checks

Run these checks in a production-like environment after the API owner has
ratified the contract. They are read-only unless the separately approved Arabic
UAT script explicitly owns a mutation.

| Check | Expected result |
| --- | --- |
| Open `/` over HTTPS | Arabic RTL application entry renders; no browser source map is exposed. |
| Refresh a permitted deep link | Host returns the SPA entry and the router renders the allowed route. |
| Open `/dev/gallery` | The production host does not expose the development gallery. |
| Sign in with the UAT account | Session hydrates through the approved cookie flow; no token is persisted in browser storage. |
| Select an allowed scope | Navigation and cached server data reflect only the selected effective scope. |
| Visit an allowed read-only view | API requests remain under `/api/v1`; Arabic loading, empty, and failure states are safe. |
| Trigger an authorized `403` test path, where available | The session remains intact and an authorization-safe response is shown. |
| Log out | Session and protected query data clear even if the logout response is delayed. |

Do not use a production document post, reversal, attachment upload, or disposal
as a smoke test. Those actions are audit-relevant and belong only to the
approved Arabic UAT workflow (`e26-t04`) with its own evidence.

## 6. Incident, rollback, and recovery

### Frontend-only incident

1. Stop promotion and capture the release commit SHA, artifact checksum,
   environment, timestamp, safe reproduction steps, and any server-provided
   trace/correlation ID.
2. Do not collect or transmit credentials, cookies, bearer headers, uploaded
   files, or raw sensitive error content.
3. If the issue is in static hosting, roll back to the last validated `dist/`
   artifact that is compatible with the currently ratified API contract. Update
   `index.html`/CDN routing first; immutable hashed assets may remain cached.
4. If the issue concerns API authorization, cookie handling, an API envelope, or
   contract behavior, stop frontend promotion and escalate to the backend/API
   owner. Do not compensate by patching generated code or changing client-side
   permissions.
5. Re-run section 5 after rollback and record the result. Create a Beads issue
   for the root cause and link release evidence.

### Security or privacy incident

Immediately restrict access through the platform/security owner, preserve only
approved incident metadata, and follow the organization incident process. The
frontend release owner must not attempt token revocation, account remediation,
or audit-record mutation from the static application.

## 7. Required release record

For every candidate, retain:

- commit SHA, artifact checksum, deployment environment, host configuration
  revision, and deployment/rollback timestamps;
- passing `contract:validate`, `quality`, and GitHub workflow evidence;
- backend/API ratification reference and contract version/checksum;
- smoke/UAT outcome, authorized role/scope category, and safe trace IDs; and
- incident/rollback links, if any.

The release remains **not ready for production** while OpenAPI/backend
ratification (`e01.7`), security review (`e26-t02`), integration review
(`e24-t10`), accessibility/performance hardening (`e25-t08`), Arabic UAT, or
release-candidate smoke evidence is outstanding.
