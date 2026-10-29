# EIAMS v1 API contract

> **The provisional snapshot is gone.** `eiams-v1.openapi.json` — the
> design-first OpenAPI 3.0.3 document this repository used to generate its
> frontend types from — has been deleted, together with the generator
> (`scripts/generate-api-types.mjs`, `scripts/openapi-generation.config.mjs`),
> the snapshot validator (`scripts/validate-contract.mjs`), the `api:types:*` and
> `contract:validate` commands, and the `openapi-typescript` / Redocly CLI
> dependencies. Nothing in this repository generates API types any more.

## What the frontend uses instead

Every module owns **handwritten per-module wire contracts** (D-INT-02 /
ADR-0001) that describe what the LIVE API serves, and every service reaches
the network through the shared `ApiTransport`. The wire contracts live beside
the module that reads them (`src/modules/<module>/types/*.api-types.ts`), with
the shared document spine in
`src/shared/documents/types/document-wire.types.ts` and the shared transport
seams in `src/shared/api/api-contracts.ts`.

The backend's own OpenAPI export is the authoritative contract, but it is a
**human-only** reference: it is not a frontend build dependency. A drift
between it and the frontend is resolved by hand, in the owning module's wire
contract, against a versioned backend change — never by regenerating a
snapshot.

Two historical files remain in this directory and describe the DELETED
snapshot, not anything the build depends on:

- `eiams-v1.provenance.json` — the version, checksum, and coverage that were
  recorded when the provisional snapshot was published.
- `eiams-v1.validation-evidence.json` — the record of the last validation
  battery run against it.

`eiams-v1.consumer-baseline.json` is a different thing entirely and IS live:
see the drift gate below.

## Shared transport conventions

- API base path: `/api/v1`
- Authentication: memory-only HTTP bearer JWT access token plus a rotating,
  browser-managed `Secure`/`HttpOnly`/`SameSite=Strict` refresh cookie scoped
  to `/api/v1/auth` (D-AUTH-01)
- Pagination: one-based `page`; default `pageSize` 25, maximum 200
- Errors: the shared `ApiErrorResponse` envelope (`success: false`, `error.code`,
  `error.message`, `error.details`, `error.request_id`)
- Optimistic concurrency: request `expectedRowVersion` and returned resource version
- Irreversible/retry-sensitive actions: UUID `Idempotency-Key` header
- Document lifecycle: D-LIFE-01 server-owned action policy, typed version-only
  or reason-required requests, and immutable oldest-first actual-event history
- Reversal: authoritative action results identify the successfully posted
  compensating document; clients never simulate ledger rollback
- Attachments: multipart upload with explicit `SignedOriginal` or `Supporting`
- Dates and identifiers: ISO 8601 date/date-time values and UUIDs

## Change control

A mismatch between the live API and the frontend is a contract change. The
backend/API owner publishes a versioned backend change; the frontend then
updates the owning module's handwritten wire contract and its integration
test, and the drift gate is re-run. Never hide a mismatch in an adapter, and
never widen a handwritten type to make an old fixture compile.

## Live contract-drift gate (ratchet)

`eiams-v1.consumer-baseline.json` is NOT a copy of a snapshot. It is a
**ratchet**: the response fingerprint of every endpoint the frontend
actually consumes, captured from the LIVE API at the moment this frontend was
written against it.

It asks one question — did anything the frontend calls move under it? — and
stays silent about the endpoints nobody calls. Each entry records the consumed
`path` + `method`, the source files that consume it, and the sorted property
names of its success-response payload (resolved through the shared
`ApiResponse<T>` envelope). An endpoint the live API does not serve is not
silently dropped: it must appear under `knownDivergences` with a written
reason, so a frontend calling unimplemented routes cannot pass in silence.

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
