# Contract Smoke Suite (`eiams-frontend-69yr`)

- Command: `pnpm run test:contract` (separate vitest config `vitest.contract.config.ts`; NOT part of `pnpm run quality` or default `test`).
- Topology: browser-equivalent origin (`localhost:5188`) -> Vite proxy (`/api/v1`) -> live backend (`127.0.0.1:5000`). No MSW.
- Cookie jar attached to the real `apiClient` via external interceptors (no edit to `src/shared/services/api.client.ts`).
- Divergences are REPORTED, not fixed, in this round.

## Established corrections to the harness / backend contract

- The bead's `/health/ready` (direct to backend `5000` with no `/api/v1`) is STALE (404). The real endpoint is `/api/v1/health/ready` and is reached through the proxy (`localhost:5188/api/v1/health/ready`). Recorded here; harness uses proxy path.
- `POST /api/v1/auth/refresh` with NO cookie returns **400** with wire code `USERS_INVALID_REFRESH_TOKEN` (not 401). Asserted exactly; documented as backend-contract note.
- `POST /api/v1/auth/login` body is exactly `{username, password}` with `Content-Type: application/json`. The previous "400 REQUEST_VALIDATION_FAILED" report was caused by incorrect request code (missing/invalid Content-Type or malformed body), NOT by a missing `email` field.
- Foreign `Origin: http://evil.origin` -> 403 `REFRESH_TOKEN_ORIGIN_REJECTED`; frontend already has copy at `src/shared/api/error-copy-ar.ts:38`. Not a divergence.
- The backend denies all CORS origins; the suite proves reachability only through `/api/v1` proxy and records a direct cross-origin call as rejected.
