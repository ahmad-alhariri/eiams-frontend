# EIAMS v1 provisional API contract

`eiams-v1.openapi.json` is the architecture-owned, design-first OpenAPI 3.0.3
contract for EIAMS v1. It is intended for Apidog import, mock APIs, contract
review, and deterministic frontend type/client generation while the backend is
under development.

This snapshot is provisional. It defines the expected API; it does not prove
that any endpoint has been implemented. Backend/API-owner ratification is
required before production integration. The exact source status, checksum,
coverage, and ratification state are recorded in
`eiams-v1.provenance.json`; Beads `eiams-frontend-e01.7` owns ratification.

## Import into Apidog

1. Import `contracts/openapi/eiams-v1.openapi.json` as an OpenAPI/Swagger file.
2. Configure the target host in the Apidog environment. The contract uses the
   relative server base path `/api/v1` so development, mock, test, and
   production hosts remain environment-owned.
3. Configure bearer-token authentication for secured requests.
4. Use Apidog's generated mock examples to exercise frontend flows until the
   backend is available.
5. Export any reviewed change and update both the semantic version and
   provenance checksum before using it for generation.

## Frontend consumption

The committed JSON snapshot is the only frontend generation input. Generated
files must not be edited by hand. Generator configuration and checked-in output
belong to Beads `eiams-frontend-e08-t01` and `eiams-frontend-e08-t02`.

The contract was verified with Redocly CLI and `openapi-typescript`. It
currently contains 78 paths, 112 operations, and 141 component schemas.

## The snapshot is behind the live backend (read this before regenerating)

As of 2026-10-20 the design snapshot and the generated types disagree, and the
snapshot is the stale side. This is recorded here because the obvious repair —
running `pnpm run api:types:generate` — is the one action that would make things
worse.

- **The snapshot is BEHIND the live backend.** The backend added the
  `OpeningRegistered` asset-movement type after `eiams-v1.openapi.json` was
  published, so the live API is authoritative for it and the snapshot is not.
- **`src/shared/types/generated/eiams-v1.ts` is AHEAD of the snapshot.** It was
  produced from a newer contract input and still carries `OpeningRegistered`.
- **Regenerating from the stale snapshot would REMOVE `OpeningRegistered`** and
  break `src/modules/asset/asset-movement-labels.ts` with `TS2353`, because that
  module reads the generated asset-movement union.

So `pnpm run api:types:check` is **non-blocking** in `.github/workflows/quality.yml`
(`continue-on-error: true`) and stays that way until the snapshot is re-ratified
from the live API. Do not make it blocking, and do not regenerate the generated
file, before that re-ratification lands.

**Deferred:** re-exporting the live API's committed swagger
(`contracts/openapi/eiams-backend-v1.openapi.json`, in the backend repository)
as the new snapshot input. That file is mid-edit by another workstream, so
reading it as a source of truth right now would capture a half-written state.
Re-export once that workstream lands.

## Shared transport conventions

- API base path: `/api/v1`
- Authentication: memory-only HTTP bearer JWT access token plus a rotating,
  browser-managed `Secure`/`HttpOnly`/`SameSite=Strict` refresh cookie scoped
  to `/api/v1/auth` (D-AUTH-01)
- Pagination: zero-based `pageIndex`; default `pageSize` 25, maximum 200
- Errors: `application/problem+json` using the shared `ProblemDetails` schema
- Optimistic concurrency: request `rowVersion` and returned resource version
- Irreversible/retry-sensitive actions: UUID `Idempotency-Key` header
- Document lifecycle: D-LIFE-01 server-owned action policy, typed version-only
  or reason-required requests, and immutable oldest-first actual-event history
- Reversal: authoritative action results identify the successfully posted
  compensating document; clients never simulate ledger rollback
- Attachments: multipart upload with explicit `SignedOriginal` or `Supporting`
- Dates and identifiers: ISO 8601 date/date-time values and UUIDs

## Ratification and change control

The backend/API owner must compare implementation behavior, authorization,
validation, status codes, and payloads against this snapshot. A mismatch is a
contract change: update the OpenAPI version, regenerate the SHA-256 in the
provenance file, rerun lint/type-generation validation, and regenerate frontend
artifacts. Never hide a mismatch in a handwritten frontend DTO or adapter.

## Live contract-drift gate (ratchet)

`eiams-v1.consumer-baseline.json` is NOT a second copy of the snapshot above.
It is a **ratchet**: the response fingerprint of every endpoint the frontend
actually consumes, captured from the LIVE API at the moment this frontend was
written against it.

The two documents answer different questions and are expected to disagree. The
snapshot is `ArchitectureOwnedProvisional` and describes 81 paths; the
implemented API serves 134. Gating "live == snapshot" would be permanently red
and would say nothing about whether the frontend still works. This gate instead
asks one question — did anything the frontend calls move under it? — and stays
silent about the endpoints nobody calls.

Each entry records the consumed `path` + `method`, the source files that consume
it, and the sorted property names of its success-response payload (resolved
through the shared `ApiResponse<T>` envelope). An endpoint the live API does not
serve is not silently dropped: it must appear under `knownDivergences` with a
written reason, so a frontend calling unimplemented routes cannot pass in
silence.

Run it against a running backend:

```bash
EIMS_OPENAPI_URL=http://localhost:5000/swagger/v1/swagger.json pnpm run contract:drift
```

Without that variable the suite SKIPS, so `pnpm run test` never needs a server.
It fails naming the method, the path and the concrete difference, e.g.
`GET /custodies (...): response properties drifted; removed: materialNameEn; added: materialNameEnglish`.

### Regenerating the baseline

Only after a REVIEWED API change, and as a separate reviewed commit from any
frontend change:

```bash
EIMS_OPENAPI_URL=http://localhost:5000/swagger/v1/swagger.json pnpm run contract:drift
# read the failures, confirm each is the change you reviewed, then re-capture
```

### CI (`.github/workflows/contract-drift.yml`)

The workflow boots the backend from the sibling `eiams-backend` repository and
runs the gate on a schedule and on manual dispatch. Checking out a private
sibling repo needs a token, so the job is `if:`-gated on it and **stays inert
until the secret exists**:

| Secret                     | Purpose                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EIAMS_BACKEND_REPO_TOKEN` | A token (classic PAT or fine-grained) with `contents: read` on the `eiams-backend` repository. Add it under **Settings → Secrets and variables → Actions** in the frontend repo, or the workflow skips every run. |

The two offline contract scripts (`api:types:check`, `contract:validate`) need no
token and run on every PR in `.github/workflows/quality.yml`.
