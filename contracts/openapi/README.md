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
