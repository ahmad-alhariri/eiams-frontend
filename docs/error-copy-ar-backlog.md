# Arabic error-copy backlog

**Bead:** `eiams-frontend-z1hs`
**Audit date:** 2026-10-05
**Subject:** `src/shared/api/error-copy-ar.ts` does not cover every error code the
EIAMS API can put on the wire.

This document is an **inventory, not a change**. It exists so a human Arabic
content owner can work through the gap in batches. It deliberately contains no
Arabic: nothing here was machine translated, and nothing here should be.

## Read this before picking up any row

The strings these codes need are **governed Arabic UI vocabulary**. They must be
authored or approved by a named Arabic content owner.

- **Do not machine translate these codes.** A generated Arabic string that
  ships is worse than the generic fallback it replaces: it looks reviewed, so
  nobody checks it, and a wrong noun in an inventory audit dialog is a
  correctness defect, not a cosmetic one.
- **Do not auto-fill the table from a translation pass.** The wire also carries
  an English `error.message`; pasting a machine rendering of that is exactly
  the outcome this bead exists to prevent.
- **Do not add a row for a code you cannot trace to a backend site.** Every row
  below carries its defining `file:line`. A code with no site is not a code.
- **Keep the existing conventions.** Keys are `UPPER_SNAKE_CASE` (the backend's
  own `ApiResults.NormalizeErrorCode` output), values are
  `{ titleAr, detailAr }`, `detailAr` is `null` unless a second line genuinely
  helps, and auth-related wording stays indistinguishable between "no such user"
  and "wrong password".
- **Honest fallback beats invented specificity.** Until a row is approved, the
  per-status generic Arabic in `src/shared/services/api-error.ts` is the
  correct rendering. Do not "temporarily" fill a gap.

## How these numbers were measured

Source of truth for the code list: **the backend C# source at
`C:\EIAMS-SYSTEM\eiams-backend`**, not the OpenAPI snapshot. The frozen
snapshot `contracts/openapi/eiams-backend-v1.openapi.json` (sha256
`37a91d33a09fc8867febd44e09bdea6fb8220e0892e5098e666ebe59ba11ec29`,
`contracts/openapi/eiams-backend-v1.provenance.json`) contains **zero**
error-code literals — it models `ApiErrorResponse` structurally and documents
only HTTP statuses, so it cannot be used to enumerate codes. The
authoritative enumeration is therefore derived from the three code-producing
families in the backend:

| Family | What it is | Count |
| --- | --- | --- |
| A | Dotted code literals passed as the `code` argument of a `SharedKernel.Error` factory (`Error.NotFound` / `Conflict` / `Problem` / `Forbidden` / `Unavailable` / `Failure`, or `new Error(...)`) anywhere under `src/` | 365 |
| B | Base-constructor codes: `Error.NullValue` → `GENERAL_NULL`, `ValidationError` → `VALIDATION_GENERAL` | 2 |
| C | Codes written straight into the wire envelope by `Web.Api`: the `ApiResults.ErrorFromStatusCode` status table, `ApiProblemDetails`' model-binding code, and `RefreshTokenTransport`'s cookie-transport codes | 17 |

Every literal is then reduced to the form the wire actually carries by a
faithful port of the backend's own `ApiResults.NormalizeErrorCode`
(`src/Web.Api/Infrastructure/ApiResults.cs:80`) — the same rule the frontend
replicates in `normalizeWireErrorCode` (`src/shared/api/envelope.ts:260`).
That normalized form is what `error-copy-ar.ts` is keyed on, so it is the
right join key. The result is diffed against the table's own keys
(`KNOWN_ERROR_CODES`, the exported `Object.keys(ALL)`).

**Reproduce it.** The audit is a script over two trees, not a hand count, and
the procedure is small enough to re-implement in any language:

1. Walk `C:\EIAMS-SYSTEM\eiams-backend\src` for `*.cs`, skipping `obj/`, `bin/`
   and `Infrastructure/Migrations/` (1221 files).
2. Capture family A with this match, taking capture group 1 as the literal:
   `new\s+Error\(|(?:Error|Result|Result<[^>]*>)\s*\.\s*(?:Failure|NotFound|Problem|Conflict|Forbidden|Unavailable)\s*\(\s*"([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)"`.
3. Add family B (`General.Null`, `Validation.General`) and family C (the 17
   `UPPER_SNAKE` codes under `src/Web.Api` that reach
   `ApiResults.Error`/`CreateErrorResponse`).
4. Normalize every literal with the backend's own rule — non-alphanumerics become
   `_`, an uppercase letter preceded by a lowercase letter starts a new segment,
   leading/trailing `_` are trimmed.
5. Read the table's keys as `/^ {2}([A-Z][A-Z0-9_]*): \{/gm` over
   `error-copy-ar.ts` (this is exactly `KNOWN_ERROR_CODES`) and diff.

The script used for this pass was run out-of-tree and is deliberately **not**
committed, so that this bead ships a document and not a new tool. The numbers
below are therefore reproducible by the procedure above rather than by running
a repo command; if the team wants the audit to run in CI (it should, once the
owner starts closing rows), the natural home is next to the existing drift guard
in `src/shared/api/backend-contract.test.ts`.

Re-run after any backend contract change and diff the numbers. If
`totalBackendCodes` moves, this document is stale.

## Current state

| Metric | Value |
| --- | --- |
| Backend error codes the API can emit | **384** |
| Covered by `error-copy-ar.ts` | **115** (29.9%) |
| Falling back to generic per-status Arabic | **269** (70.1%) |
| Entries in the `error-copy-ar.ts` table | 116 |
| Frontend keys with no backend counterpart | 1 |

All 269 uncovered codes resolve today to `fallbackFeedback(status, code)`
in `src/shared/services/api-error.ts:128` — that is, the shared
`STATUS_FEEDBACK` string for the HTTP status, or the 5xx / unexpected wording
when the status has no entry. No English reaches the user in that path, so the
defect is **lost specificity**, not a language leak.

### Coverage by backend area

| Backend area | Codes | Covered | Uncovered |
| --- | --- | --- | --- |
| `Domain layer / DocumentLines` | 30 | 0 | **30** |
| `Domain layer / InventoryAdjustments` | 26 | 4 | **22** |
| `Domain layer / AuditLogs` | 20 | 1 | **19** |
| `Domain layer / InventoryCounts` | 21 | 4 | **17** |
| `Domain layer / Materials` | 14 | 0 | **14** |
| `Domain layer / Custodies` | 19 | 7 | **12** |
| `Domain layer / MaterialUnitConversions` | 11 | 0 | **11** |
| `Domain layer / IssueTos` | 9 | 0 | **9** |
| `Domain layer / ReturnInfos` | 9 | 0 | **9** |
| `Domain layer / DocumentLineAssetSelections` | 11 | 3 | **8** |
| `Domain layer / UserRoleScopes` | 17 | 10 | **7** |
| `Domain layer / WarehouseCapabilities` | 7 | 0 | **7** |
| `Domain layer / WarehouseMaterialSettings` | 7 | 0 | **7** |
| `Application layer / Abstractions` | 6 | 0 | **6** |
| `Domain layer / ReceivingInfo` | 6 | 0 | **6** |
| `Domain layer / TransferInfos` | 8 | 2 | **6** |
| `Domain layer / WarehouseDocuments` | 19 | 13 | **6** |
| `Domain layer / Assets` | 6 | 1 | **5** |
| `Domain layer / MaterialCategories` | 6 | 1 | **5** |
| `Domain layer / OrganizationalUnits` | 5 | 0 | **5** |
| `Domain layer / Warehouses` | 11 | 6 | **5** |
| `Domain layer / CustodyHistories` | 4 | 0 | **4** |
| `Domain layer / Employees` | 4 | 0 | **4** |
| `Domain layer / ExternalParties` | 5 | 1 | **4** |
| `Domain layer / Roles` | 11 | 7 | **4** |
| `Domain layer / StockMovements` | 4 | 0 | **4** |
| `Application layer / Custodies` | 3 | 0 | **3** |
| `Domain layer / InventoryBalances` | 3 | 0 | **3** |
| `Domain layer / MaterialFamilies` | 3 | 0 | **3** |
| `Domain layer / Organizations` | 3 | 0 | **3** |
| `Domain layer / UnitsOfMeasure` | 3 | 0 | **3** |
| `Domain layer / AssetMovementHistories` | 2 | 0 | **2** |
| `Domain layer / Sites` | 5 | 3 | **2** |
| `Domain layer / WarehouseCapabilityOperations` | 5 | 3 | **2** |
| `Infrastructure layer / Ledger` | 2 | 0 | **2** |
| `Application layer / Assets` | 1 | 0 | **1** |
| `Application layer / Reports` | 1 | 0 | **1** |
| `Application layer / Returns` | 1 | 0 | **1** |
| `Domain layer / DocumentAttachments` | 16 | 15 | **1** |
| `Domain layer / DocumentSequences` | 5 | 4 | **1** |
| `Domain layer / Idempotency` | 1 | 0 | **1** |
| `Domain layer / MaterialDomains` | 3 | 2 | **1** |
| `Domain layer / Users` | 11 | 10 | **1** |
| `SharedKernel` | 2 | 1 | **1** |
| `Web.Api envelope (transport/status codes)` | 17 | 16 | **1** |
| `Domain layer / Permissions` | 1 | 1 | **0** |

### How this compares with the bead's earlier figures

The bead text is explicit that its own counts are stale and asks for a fresh
audit. This audit disagrees with them, so the numbers here should replace them
rather than sit beside them:

| Figure | Bead text | This audit |
| --- | --- | --- |
| Total backend codes | 382 | **384** (365 dotted domain literals + 2 `SharedKernel` base-constructor codes + 17 `Web.Api` envelope codes) |
| Table entries | 103, then 115 | **116** |
| Covered | 86 domain + 17 status-derived | **115** |
| Uncovered | 296, then "~286" | **269** |
| Fallback rate | 78% | **70.1%** |

Two specific corrections the owner should carry forward:

- The bead's "~286 remaining" **excludes `REFRESH_TOKEN_BODY_DISABLED`**, which
  the backend does emit (400) from `RefreshTokenTransport.Resolve` when a
  refresh request carries a body. The frontend table has no entry for it, so it
  renders as the generic 400 string.
- The bead's total of **382** and this audit's **384** differ by 2. The bead did
  not record which enumeration it produced its number from, and the original
  audit script was not kept, so this document does not invent a cause. It
  publishes the scope it used (families A/B/C above) so the next audit can be
  diffed against something concrete.

## Notes on the measurement itself

- **One frontend key has no backend counterpart.** `INVENTORY_BALANCES_NOT_FOUND`
  can never be selected by `arabicCopyForCode`:
  `Domain/InventoryBalances/InventoryBalanceErrors.cs` declares only
  `Forbidden`, `NegativeQuantity` and `InsufficientQuantity`, so there is no
  `InventoryBalances.NotFound` for the key to match. The bead records it as one of
  the `*_NOT_FOUND` entries added "for the tests", which means the fixture ended
  up agreeing with itself rather than with the API. This document does not change
  it (the table is governed); it is flagged for the owner and the backend team to
  reconcile.
- **Rate limiting is not in the list on purpose.**
  `RateLimitingExtensions.cs` returns an empty 429 body from `OnRejected`, so
  `RATE_LIMIT_EXCEEDED` reaches the client only through
  `ErrorFromStatusCode`, which is where this audit reads it from.
- **The family-A match also accepts `Result.Failure(...)` as a code site, and
  matched zero there.** All 365 family-A codes therefore came from
  `Error.*` factories or `new Error(...)`, which is a code-bearing
  constructor by construction — nothing in the inventory was picked up by a bare
  dotted string sitting in the tree.
- **This audit counts what the API can emit, not what the UI can reach.** Some of
  the codes below belong to endpoints this frontend does not call yet. The
  acceptance criterion on this bead is "every backend code the app can actually
  render", so a useful first pass is to cross-check each batch against the
  frontend modules in the last column and deprioritise what no module touches.

## Uncovered codes by backend aggregate

Every code below is emitted by the backend at the cited site and currently
renders as generic per-status Arabic. Batches are grouped by the aggregate
prefix of the dotted literal (`DocumentLines.*`, `AuditLogs.*`, …), because
that prefix is what decides the Arabic noun a message has to use — one pass per
aggregate produces consistent copy, which is the point. "Defined at" is where the
code literal is written; "+N more raise sites" counts additional backend files
that raise the same code.

### 1. `DocumentLines.*` — 30 uncovered

Backend domain: `Domain/DocumentLines/DocumentLineErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `DOCUMENT_LINES_ASSET_DOCUMENT_LIMIT_EXCEEDED` | `DocumentLines.AssetDocumentLimitExceeded` | `Domain/DocumentLines/DocumentLineErrors.cs:92` | `warehouse` | |
| `DOCUMENT_LINES_ASSET_QUANTITY_LIMIT_EXCEEDED` | `DocumentLines.AssetQuantityLimitExceeded` | `Domain/DocumentLines/DocumentLineErrors.cs:87` | `warehouse` | |
| `DOCUMENT_LINES_ASSET_QUANTITY_MUST_BE_WHOLE` | `DocumentLines.AssetQuantityMustBeWhole` | `Domain/DocumentLines/DocumentLineErrors.cs:82` | `warehouse` | |
| `DOCUMENT_LINES_BASE_QUANTITY_MISMATCH` | `DocumentLines.BaseQuantityMismatch` | `Domain/DocumentLines/DocumentLineErrors.cs:106` | `warehouse` | |
| `DOCUMENT_LINES_BASE_QUANTITY_MUST_BE_POSITIVE` | `DocumentLines.BaseQuantityMustBePositive` | `Domain/DocumentLines/DocumentLineErrors.cs:17` | `warehouse` | |
| `DOCUMENT_LINES_BASE_QUANTITY_OVERFLOW` | `DocumentLines.BaseQuantityOverflow` | `Domain/DocumentLines/DocumentLineErrors.cs:55` | `warehouse` | |
| `DOCUMENT_LINES_BASE_UNIT_PROVENANCE_STALE` | `DocumentLines.BaseUnitProvenanceStale` | `Domain/DocumentLines/DocumentLineErrors.cs:154` | `warehouse` | |
| `DOCUMENT_LINES_CLASSIFICATION_PROVENANCE_STALE` | `DocumentLines.ClassificationProvenanceStale` | `Domain/DocumentLines/DocumentLineErrors.cs:171` | `warehouse` | |
| `DOCUMENT_LINES_CONVERSION_PROVENANCE_CHANGED` | `DocumentLines.ConversionProvenanceChanged` | `Domain/DocumentLines/DocumentLineErrors.cs:205` | `warehouse` | |
| `DOCUMENT_LINES_CONVERSION_PROVENANCE_STALE` | `DocumentLines.ConversionProvenanceStale` | `Domain/DocumentLines/DocumentLineErrors.cs:188` | `warehouse` | |
| `DOCUMENT_LINES_LINES_LIMIT_EXCEEDED` | `DocumentLines.LinesLimitExceeded` | `Domain/DocumentLines/DocumentLineErrors.cs:97` | `warehouse` | |
| `DOCUMENT_LINES_LINE_TYPE_MISMATCH` | `DocumentLines.LineTypeMismatch` | `Domain/DocumentLines/DocumentLineErrors.cs:121` | `warehouse` | |
| `DOCUMENT_LINES_MATERIAL_CATEGORY_NOT_ACTIVE` | `DocumentLines.MaterialCategoryNotActive` | `Domain/DocumentLines/DocumentLineErrors.cs:35` | `warehouse` | |
| `DOCUMENT_LINES_MATERIAL_DOMAIN_NOT_ACTIVE` | `DocumentLines.MaterialDomainNotActive` | `Domain/DocumentLines/DocumentLineErrors.cs:40` | `warehouse` | |
| `DOCUMENT_LINES_MATERIAL_FAMILY_NOT_ACTIVE` | `DocumentLines.MaterialFamilyNotActive` | `Domain/DocumentLines/DocumentLineErrors.cs:30` | `warehouse` | |
| `DOCUMENT_LINES_MATERIAL_NOT_ACTIVE` | `DocumentLines.MaterialNotActive` | `Domain/DocumentLines/DocumentLineErrors.cs:25` | `warehouse` | |
| `DOCUMENT_LINES_MATERIAL_PROVENANCE_STALE` | `DocumentLines.MaterialProvenanceStale` | `Domain/DocumentLines/DocumentLineErrors.cs:137` | `warehouse` | |
| `DOCUMENT_LINES_NOT_FOUND` | `DocumentLines.NotFound` | `Domain/DocumentLines/DocumentLineErrors.cs:8` | `warehouse` | |
| `DOCUMENT_LINES_OPENING_TYPE_INVALID` | `DocumentLines.OpeningTypeInvalid` | `Domain/DocumentLines/DocumentLineErrors.cs:77` | `warehouse` | |
| `DOCUMENT_LINES_OPENING_TYPE_NOT_ALLOWED` | `DocumentLines.OpeningTypeNotAllowed` | `Domain/DocumentLines/DocumentLineErrors.cs:72` | `warehouse` | |
| `DOCUMENT_LINES_OPENING_TYPE_REQUIRED` | `DocumentLines.OpeningTypeRequired` | `Domain/DocumentLines/DocumentLineErrors.cs:67` | `warehouse` | |
| `DOCUMENT_LINES_PROVENANCE_CAPTURE_INVALID` | `DocumentLines.ProvenanceCaptureInvalid` | `Domain/DocumentLines/DocumentLineErrors.cs:246` | `warehouse` | |
| `DOCUMENT_LINES_PROVENANCE_INCOMPLETE` | `DocumentLines.ProvenanceIncomplete` | `Domain/DocumentLines/DocumentLineErrors.cs:235` | `warehouse` | |
| `DOCUMENT_LINES_PROVENANCE_NOT_CAPTURED` | `DocumentLines.ProvenanceNotCaptured` | `Domain/DocumentLines/DocumentLineErrors.cs:224` | `warehouse` | |
| `DOCUMENT_LINES_QUANTITY_MUST_BE_POSITIVE` | `DocumentLines.QuantityMustBePositive` | `Domain/DocumentLines/DocumentLineErrors.cs:13` | `warehouse` | |
| `DOCUMENT_LINES_QUANTITY_PRECISION_INVALID` | `DocumentLines.QuantityPrecisionInvalid` | `Domain/DocumentLines/DocumentLineErrors.cs:59` | `warehouse` | |
| `DOCUMENT_LINES_UNIT_CONVERSION_NOT_FOUND` | `DocumentLines.UnitConversionNotFound` | `Domain/DocumentLines/DocumentLineErrors.cs:50` | `warehouse` | |
| `DOCUMENT_LINES_UNIT_NOT_FOUND` | `DocumentLines.UnitNotFound` | `Domain/DocumentLines/DocumentLineErrors.cs:45` | `warehouse` | |
| `DOCUMENT_LINES_UNIT_PRICE_MUST_BE_NON_NEGATIVE` | `DocumentLines.UnitPriceMustBeNonNegative` | `Domain/DocumentLines/DocumentLineErrors.cs:21` | `warehouse` | |
| `DOCUMENT_LINES_UNIT_PRICE_PRECISION_INVALID` | `DocumentLines.UnitPricePrecisionInvalid` | `Domain/DocumentLines/DocumentLineErrors.cs:63` | `warehouse` | |

### 2. `AuditLogs.*` — 19 uncovered

Backend domain: `Domain/AuditLogs/AuditLogEntryErrors.cs`, `Domain/AuditLogs/AuditLogErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `AUDIT_LOGS_ACTION_INVALID` | `AuditLogs.ActionInvalid` | `Domain/AuditLogs/AuditLogErrors.cs:29` | `reports` | |
| `AUDIT_LOGS_AGGREGATE_TYPE_INVALID` | `AuditLogs.AggregateTypeInvalid` | `Domain/AuditLogs/AuditLogErrors.cs:27` | `reports` | |
| `AUDIT_LOGS_AUDIT_LOG_ENTRY_IDENTITY_REQUIRED` | `AuditLogs.AuditLogEntryIdentityRequired` | `Domain/AuditLogs/AuditLogEntryErrors.cs:7` | `reports` | |
| `AUDIT_LOGS_COMMAND_NAME_TOO_LONG` | `AuditLogs.CommandNameTooLong` | `Domain/AuditLogs/AuditLogErrors.cs:31` | `reports` | |
| `AUDIT_LOGS_ENTITY_ID_REQUIRED` | `AuditLogs.EntityIdRequired` | `Domain/AuditLogs/AuditLogErrors.cs:25` | `reports` | |
| `AUDIT_LOGS_ENTITY_TYPE_INVALID` | `AuditLogs.EntityTypeInvalid` | `Domain/AuditLogs/AuditLogErrors.cs:26` | `reports` | |
| `AUDIT_LOGS_FIELD_CHANGE_REQUIRED` | `AuditLogs.FieldChangeRequired` | `Domain/AuditLogs/AuditLogEntryErrors.cs:9` | `reports` | |
| `AUDIT_LOGS_FIELD_NAME_INVALID` | `AuditLogs.FieldNameInvalid` | `Domain/AuditLogs/AuditLogEntryErrors.cs:8` | `reports` | |
| `AUDIT_LOGS_FILTER_INVALID` | `AuditLogs.FilterInvalid` | `Domain/AuditLogs/AuditLogErrors.cs:12` | `reports` | |
| `AUDIT_LOGS_IP_ADDRESS_TOO_LONG` | `AuditLogs.IpAddressTooLong` | `Domain/AuditLogs/AuditLogErrors.cs:34` | `reports` | |
| `AUDIT_LOGS_NO_CHANGE_PAIR` | `AuditLogs.NoChangePair` | `Domain/AuditLogs/AuditLogEntryErrors.cs:10` | `reports` | |
| `AUDIT_LOGS_NO_SCOPE_ASSIGNED` | `AuditLogs.NoScopeAssigned` | `Domain/AuditLogs/AuditLogErrors.cs:20` | `reports` | |
| `AUDIT_LOGS_OPERATION_ID_REQUIRED` | `AuditLogs.OperationIdRequired` | `Domain/AuditLogs/AuditLogErrors.cs:24` | `reports` | |
| `AUDIT_LOGS_REQUEST_ID_TOO_LONG` | `AuditLogs.RequestIdTooLong` | `Domain/AuditLogs/AuditLogErrors.cs:30` | `reports` | |
| `AUDIT_LOGS_SUMMARY_NOT_JSON_OBJECT` | `AuditLogs.SummaryNotJsonObject` | `Domain/AuditLogs/AuditLogErrors.cs:32` | `reports` | |
| `AUDIT_LOGS_SUMMARY_TOO_LARGE` | `AuditLogs.SummaryTooLarge` | `Domain/AuditLogs/AuditLogErrors.cs:33` | `reports` | |
| `AUDIT_LOGS_TIMESTAMP_NOT_UTC` | `AuditLogs.TimestampNotUtc` | `Domain/AuditLogs/AuditLogErrors.cs:35` | `reports` | |
| `AUDIT_LOGS_UNAUTHORIZED` | `AuditLogs.Unauthorized` | `Domain/AuditLogs/AuditLogErrors.cs:16` | `reports` | |
| `AUDIT_LOGS_USER_ID_INVALID` | `AuditLogs.UserIdInvalid` | `Domain/AuditLogs/AuditLogErrors.cs:28` | `reports` | |

### 3. `Custodies.*` — 15 uncovered

Backend domain: `Application/Custodies/GetCustodies/GetCustodiesQueryHandler.cs`, `Application/Custodies/Transfer/TransferCustodyCommandHandler.cs`, `Domain/Custodies/CustodyErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `CUSTODIES_CANNOT_REVERSE_CHANGED_CUSTODY` | `Custodies.CannotReverseChangedCustody` | `Domain/Custodies/CustodyErrors.cs:16` | `custody` | |
| `CUSTODIES_CLOSE_TIME_INVALID` | `Custodies.CloseTimeInvalid` | `Domain/Custodies/CustodyErrors.cs:24` | `custody` | |
| `CUSTODIES_CONCURRENCY_CONFLICT` | `Custodies.ConcurrencyConflict` | `Application/Custodies/Transfer/TransferCustodyCommandHandler.cs:241` | `custody` | |
| `CUSTODIES_CUSTODY_KIND_INVALID` | `Custodies.CustodyKindInvalid` | `Domain/Custodies/CustodyErrors.cs:19` | `custody` | |
| `CUSTODIES_DISPOSAL_DOCUMENT_REQUIRED` | `Custodies.DisposalDocumentRequired` | `Domain/Custodies/CustodyErrors.cs:26` | `custody` | |
| `CUSTODIES_EXTERNAL_HOLDER_NOT_SUPPORTED` | `Custodies.ExternalHolderNotSupported` | `Domain/Custodies/CustodyErrors.cs:14` | `custody` | |
| `CUSTODIES_HOLDER_TYPE_INVALID` | `Custodies.HolderTypeInvalid` | `Domain/Custodies/CustodyErrors.cs:18` | `custody` | |
| `CUSTODIES_IDENTITY_REQUIRED` | `Custodies.IdentityRequired` | `Domain/Custodies/CustodyErrors.cs:17` | `custody` | |
| `CUSTODIES_INVALID_SUBJECT_TYPE` | `Custodies.InvalidSubjectType` | `Application/Custodies/Transfer/TransferCustodyCommandHandler.cs:232` | `custody` | |
| `CUSTODIES_NOT_OPERATIONAL` | `Custodies.NotOperational` | `Domain/Custodies/CustodyErrors.cs:11` | `custody` | |
| `CUSTODIES_OPERATIONAL_REQUIRES_NON_EMPLOYEE` | `Custodies.OperationalRequiresNonEmployee` | `Domain/Custodies/CustodyErrors.cs:22` | `custody` | |
| `CUSTODIES_PERSONAL_REQUIRES_EMPLOYEE` | `Custodies.PersonalRequiresEmployee` | `Domain/Custodies/CustodyErrors.cs:21` | `custody` | |
| `CUSTODIES_RETURN_DOCUMENT_REQUIRED` | `Custodies.ReturnDocumentRequired` | `Domain/Custodies/CustodyErrors.cs:25` | `custody` | |
| `CUSTODIES_STATUS_INVALID` | `Custodies.StatusInvalid` | `Domain/Custodies/CustodyErrors.cs:20` | `custody` | |
| `CUSTODIES_UNAUTHORIZED` | `Custodies.Unauthorized` | `Application/Custodies/GetCustodies/GetCustodiesQueryHandler.cs:35` (+1 more raise site) | `custody` | |

### 4. `Materials.*` — 14 uncovered

Backend domain: `Domain/Materials/MaterialErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `MATERIALS_ARCHIVED_IS_TERMINAL` | `Materials.ArchivedIsTerminal` | `Domain/Materials/MaterialErrors.cs:56` | `catalog` | |
| `MATERIALS_ASSET_MUST_BE_SERIAL_TRACKED` | `Materials.AssetMustBeSerialTracked` | `Domain/Materials/MaterialErrors.cs:43` | `catalog` | |
| `MATERIALS_CATALOG_VERSION_MISMATCH` | `Materials.CatalogVersionMismatch` | `Domain/Materials/MaterialErrors.cs:61` | `catalog` | |
| `MATERIALS_CATEGORY_NOT_ACTIVE` | `Materials.CategoryNotActive` | `Domain/Materials/MaterialErrors.cs:31` | `catalog` | |
| `MATERIALS_CLASSIFICATION_LOCKED` | `Materials.ClassificationLocked` | `Domain/Materials/MaterialErrors.cs:47` | `catalog` | |
| `MATERIALS_CODE_NOT_UNIQUE` | `Materials.CodeNotUnique` | `Domain/Materials/MaterialErrors.cs:11` | `catalog` | |
| `MATERIALS_CONSUMABLE_MUST_BE_QUANTITY_TRACKED` | `Materials.ConsumableMustBeQuantityTracked` | `Domain/Materials/MaterialErrors.cs:39` | `catalog` | |
| `MATERIALS_DOMAIN_NOT_ACTIVE` | `Materials.DomainNotActive` | `Domain/Materials/MaterialErrors.cs:35` | `catalog` | |
| `MATERIALS_FAMILY_NOT_ACTIVE` | `Materials.FamilyNotActive` | `Domain/Materials/MaterialErrors.cs:27` | `catalog` | |
| `MATERIALS_FAMILY_NOT_FOUND` | `Materials.FamilyNotFound` | `Domain/Materials/MaterialErrors.cs:15` | `catalog` | |
| `MATERIALS_FORBIDDEN` | `Materials.Forbidden` | `Domain/Materials/MaterialErrors.cs:52` | `catalog` | |
| `MATERIALS_NOT_FOUND` | `Materials.NotFound` | `Domain/Materials/MaterialErrors.cs:7` | `catalog` | |
| `MATERIALS_UNIT_NOT_ACTIVE` | `Materials.UnitNotActive` | `Domain/Materials/MaterialErrors.cs:23` | `catalog` | |
| `MATERIALS_UNIT_NOT_FOUND` | `Materials.UnitNotFound` | `Domain/Materials/MaterialErrors.cs:19` | `catalog` | |

### 5. `MaterialUnitConversions.*` — 11 uncovered

Backend domain: `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `MATERIAL_UNIT_CONVERSIONS_ALREADY_EXISTS` | `MaterialUnitConversions.AlreadyExists` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:39` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_BASE_UNIT_MISMATCH` | `MaterialUnitConversions.BaseUnitMismatch` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:23` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_FACTOR_MUST_BE_POSITIVE` | `MaterialUnitConversions.FactorMustBePositive` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:27` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_FORBIDDEN` | `MaterialUnitConversions.Forbidden` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:48` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_MATERIAL_NOT_FOUND` | `MaterialUnitConversions.MaterialNotFound` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:11` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_NOT_FOUND` | `MaterialUnitConversions.NotFound` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:7` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_PROVENANCE_IN_USE` | `MaterialUnitConversions.ProvenanceInUse` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:43` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_SAME_UNIT` | `MaterialUnitConversions.SameUnit` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:31` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_UNIT_NOT_ACTIVE` | `MaterialUnitConversions.UnitNotActive` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:19` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_UNIT_NOT_FOUND` | `MaterialUnitConversions.UnitNotFound` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:15` | `catalog` | |
| `MATERIAL_UNIT_CONVERSIONS_UNIT_TYPE_MISMATCH` | `MaterialUnitConversions.UnitTypeMismatch` | `Domain/MaterialUnitConversions/MaterialUnitConversionErrors.cs:35` | `catalog` | |

### 6. `AdjustmentLines.*` — 10 uncovered

Backend domain: `Domain/InventoryAdjustments/AdjustmentLineErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ADJUSTMENT_LINES_ASSET_QUANTITY_ADJUSTMENT_NOT_SUPPORTED` | `AdjustmentLines.AssetQuantityAdjustmentNotSupported` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:13` | `adjustment` | |
| `ADJUSTMENT_LINES_DEDICATED_ENDPOINT_REQUIRED` | `AdjustmentLines.DedicatedEndpointRequired` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:15` | `adjustment` | |
| `ADJUSTMENT_LINES_DIFFERENCE_INVALID` | `AdjustmentLines.DifferenceInvalid` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:9` | `adjustment` | |
| `ADJUSTMENT_LINES_DIFFERENCE_MUST_MATCH_DOCUMENT_LINE` | `AdjustmentLines.DifferenceMustMatchDocumentLine` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:14` | `adjustment` | |
| `ADJUSTMENT_LINES_DUPLICATE` | `AdjustmentLines.Duplicate` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:19` | `adjustment` | |
| `ADJUSTMENT_LINES_IDENTITY_REQUIRED` | `AdjustmentLines.IdentityRequired` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:8` | `adjustment` | |
| `ADJUSTMENT_LINES_NOT_FOUND` | `AdjustmentLines.NotFound` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:7` | `adjustment` | |
| `ADJUSTMENT_LINES_REASON_REQUIRED` | `AdjustmentLines.ReasonRequired` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:11` | `adjustment` | |
| `ADJUSTMENT_LINES_REASON_TOO_LONG` | `AdjustmentLines.ReasonTooLong` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:12` | `adjustment` | |
| `ADJUSTMENT_LINES_ZERO_DIFFERENCE` | `AdjustmentLines.ZeroDifference` | `Domain/InventoryAdjustments/AdjustmentLineErrors.cs:10` | `adjustment` | |

### 7. `InventoryAdjustments.*` — 10 uncovered

Backend domain: `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `INVENTORY_ADJUSTMENTS_COUNT_LINKED_IMMUTABLE` | `InventoryAdjustments.CountLinkedImmutable` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:21` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_COUNT_SOURCE_DRIFTED` | `InventoryAdjustments.CountSourceDrifted` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:17` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_IDENTITY_REQUIRED` | `InventoryAdjustments.IdentityRequired` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:10` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_INVALID_TRANSITION` | `InventoryAdjustments.InvalidTransition` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:14` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_KIND_INVALID` | `InventoryAdjustments.KindInvalid` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:11` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_NOT_FOUND` | `InventoryAdjustments.NotFound` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:7` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_REASON_REQUIRED` | `InventoryAdjustments.ReasonRequired` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:12` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_REASON_TOO_LONG` | `InventoryAdjustments.ReasonTooLong` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:13` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_REQUIRED` | `InventoryAdjustments.Required` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:8` | `adjustment` | |
| `INVENTORY_ADJUSTMENTS_WRONG_DOCUMENT_TYPE` | `InventoryAdjustments.WrongDocumentType` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:9` | `adjustment` | |

### 8. `InventoryCounts.*` — 10 uncovered

Backend domain: `Domain/InventoryCounts/InventoryCountErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `INVENTORY_COUNTS_IDENTITY_REQUIRED` | `InventoryCounts.IdentityRequired` | `Domain/InventoryCounts/InventoryCountErrors.cs:8` | `inventory-count` | |
| `INVENTORY_COUNTS_INVALID_FREEZE_POLICY` | `InventoryCounts.InvalidFreezePolicy` | `Domain/InventoryCounts/InventoryCountErrors.cs:11` | `inventory-count` | |
| `INVENTORY_COUNTS_INVALID_SCOPE` | `InventoryCounts.InvalidScope` | `Domain/InventoryCounts/InventoryCountErrors.cs:10` | `inventory-count` | |
| `INVENTORY_COUNTS_INVALID_TRANSITION` | `InventoryCounts.InvalidTransition` | `Domain/InventoryCounts/InventoryCountErrors.cs:13` | `inventory-count` | |
| `INVENTORY_COUNTS_INVALID_TYPE` | `InventoryCounts.InvalidType` | `Domain/InventoryCounts/InventoryCountErrors.cs:9` | `inventory-count` | |
| `INVENTORY_COUNTS_NOT_FOUND` | `InventoryCounts.NotFound` | `Domain/InventoryCounts/InventoryCountErrors.cs:7` | `inventory-count` | |
| `INVENTORY_COUNTS_SCOPE_REFERENCE_INVALID` | `InventoryCounts.ScopeReferenceInvalid` | `Domain/InventoryCounts/InventoryCountErrors.cs:12` | `inventory-count` | |
| `INVENTORY_COUNTS_SNAPSHOT_EMPTY` | `InventoryCounts.SnapshotEmpty` | `Domain/InventoryCounts/InventoryCountErrors.cs:16` | `inventory-count` | |
| `INVENTORY_COUNTS_TIMESTAMP_INVALID` | `InventoryCounts.TimestampInvalid` | `Domain/InventoryCounts/InventoryCountErrors.cs:20` | `inventory-count` | |
| `INVENTORY_COUNTS_VARIANCE_REASONS_REQUIRED` | `InventoryCounts.VarianceReasonsRequired` | `Domain/InventoryCounts/InventoryCountErrors.cs:18` | `inventory-count` | |

### 9. `IssueTos.*` — 9 uncovered

Backend domain: `Domain/IssueTos/IssueToErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ISSUE_TOS_ASSET_LINES_NOT_SUPPORTED` | `IssueTos.AssetLinesNotSupported` | `Domain/IssueTos/IssueToErrors.cs:44` | `issue` | |
| `ISSUE_TOS_EXTERNAL_RECIPIENT_NOT_SUPPORTED` | `IssueTos.ExternalRecipientNotSupported` | `Domain/IssueTos/IssueToErrors.cs:28` | `issue` | |
| `ISSUE_TOS_ISSUE_REASON_INVALID` | `IssueTos.IssueReasonInvalid` | `Domain/IssueTos/IssueToErrors.cs:40` | `issue` | |
| `ISSUE_TOS_RECIPIENT_INACTIVE` | `IssueTos.RecipientInactive` | `Domain/IssueTos/IssueToErrors.cs:23` | `issue` | |
| `ISSUE_TOS_RECIPIENT_NOT_FOUND` | `IssueTos.RecipientNotFound` | `Domain/IssueTos/IssueToErrors.cs:18` | `issue` | |
| `ISSUE_TOS_RECIPIENT_REQUIRED` | `IssueTos.RecipientRequired` | `Domain/IssueTos/IssueToErrors.cs:36` | `issue` | |
| `ISSUE_TOS_RECIPIENT_TYPE_INVALID` | `IssueTos.RecipientTypeInvalid` | `Domain/IssueTos/IssueToErrors.cs:32` | `issue` | |
| `ISSUE_TOS_REQUIRED` | `IssueTos.Required` | `Domain/IssueTos/IssueToErrors.cs:8` | `issue` | |
| `ISSUE_TOS_WRONG_DOCUMENT_TYPE` | `IssueTos.WrongDocumentType` | `Domain/IssueTos/IssueToErrors.cs:13` | `issue` | |

### 10. `ReturnInfos.*` — 9 uncovered

Backend domain: `Domain/ReturnInfos/ReturnInfoErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `RETURN_INFOS_DURABLE_ALLOCATION_NOT_FOUND` | `ReturnInfos.DurableAllocationNotFound` | `Domain/ReturnInfos/ReturnInfoErrors.cs:35` | `issue` | |
| `RETURN_INFOS_ORIGINAL_ISSUE_INVALID` | `ReturnInfos.OriginalIssueInvalid` | `Domain/ReturnInfos/ReturnInfoErrors.cs:25` | `issue` | |
| `RETURN_INFOS_ORIGINAL_ISSUE_REQUIRED` | `ReturnInfos.OriginalIssueRequired` | `Domain/ReturnInfos/ReturnInfoErrors.cs:17` | `issue` | |
| `RETURN_INFOS_REQUIRED` | `ReturnInfos.Required` | `Domain/ReturnInfos/ReturnInfoErrors.cs:7` | `issue` | |
| `RETURN_INFOS_RETURN_QUANTITY_EXCEEDS_ACTIVE` | `ReturnInfos.ReturnQuantityExceedsActive` | `Domain/ReturnInfos/ReturnInfoErrors.cs:40` | `issue` | |
| `RETURN_INFOS_RETURN_REASON_INVALID` | `ReturnInfos.ReturnReasonInvalid` | `Domain/ReturnInfos/ReturnInfoErrors.cs:21` | `issue` | |
| `RETURN_INFOS_TRACKED_UNIT_NOT_FOUND` | `ReturnInfos.TrackedUnitNotFound` | `Domain/ReturnInfos/ReturnInfoErrors.cs:45` | `issue` | |
| `RETURN_INFOS_WRONG_DOCUMENT_TYPE` | `ReturnInfos.WrongDocumentType` | `Domain/ReturnInfos/ReturnInfoErrors.cs:12` | `issue` | |
| `RETURN_INFOS_WRONG_WAREHOUSE` | `ReturnInfos.WrongWarehouse` | `Domain/ReturnInfos/ReturnInfoErrors.cs:30` | `issue` | |

### 11. `DocumentLineAssetSelections.*` — 8 uncovered

Backend domain: `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `DOCUMENT_LINE_ASSET_SELECTIONS_ACTIVE_CUSTODY_MISMATCH` | `DocumentLineAssetSelections.ActiveCustodyMismatch` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:16` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_ASSET_NOT_FOR_LINE_MATERIAL` | `DocumentLineAssetSelections.AssetNotForLineMaterial` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:11` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_ASSET_NOT_IN_SOURCE_WAREHOUSE` | `DocumentLineAssetSelections.AssetNotInSourceWarehouse` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:12` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_IDENTITY_REQUIRED` | `DocumentLineAssetSelections.IdentityRequired` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:7` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_LINE_HAS_SELECTIONS` | `DocumentLineAssetSelections.LineHasSelections` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:17` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_NOT_FOUND` | `DocumentLineAssetSelections.NotFound` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:8` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_UNSUPPORTED_DOCUMENT_TYPE` | `DocumentLineAssetSelections.UnsupportedDocumentType` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:14` | `warehouse` | |
| `DOCUMENT_LINE_ASSET_SELECTIONS_UNSUPPORTED_LINE_TYPE` | `DocumentLineAssetSelections.UnsupportedLineType` | `Domain/DocumentLineAssetSelections/DocumentLineAssetSelectionErrors.cs:15` | `warehouse` | |

### 12. `InventoryCountLines.*` — 7 uncovered

Backend domain: `Domain/InventoryCounts/InventoryCountLineErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `INVENTORY_COUNT_LINES_ACTUAL_REQUIRED` | `InventoryCountLines.ActualRequired` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:11` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_ASSET_QUANTITY_INVALID` | `InventoryCountLines.AssetQuantityInvalid` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:10` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_IDENTITY_REQUIRED` | `InventoryCountLines.IdentityRequired` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:8` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_NOT_FOUND` | `InventoryCountLines.NotFound` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:7` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_QUANTITY_INVALID` | `InventoryCountLines.QuantityInvalid` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:9` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_VARIANCE_REASON_REQUIRED` | `InventoryCountLines.VarianceReasonRequired` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:12` | `inventory-count` | |
| `INVENTORY_COUNT_LINES_VARIANCE_REASON_TOO_LONG` | `InventoryCountLines.VarianceReasonTooLong` | `Domain/InventoryCounts/InventoryCountLineErrors.cs:13` | `inventory-count` | |

### 13. `UserRoleScopes.*` — 7 uncovered

Backend domain: `Domain/UserRoleScopes/UserRoleScopeErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `USER_ROLE_SCOPES_ASSIGNMENT_NOT_FOUND` | `UserRoleScopes.AssignmentNotFound` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:16` | `auth` | |
| `USER_ROLE_SCOPES_FORBIDDEN` | `UserRoleScopes.Forbidden` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:73` | `auth` | |
| `USER_ROLE_SCOPES_MULTIPLE_ASSIGNMENTS` | `UserRoleScopes.MultipleAssignments` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:24` | `auth` | |
| `USER_ROLE_SCOPES_NOT_FOUND` | `UserRoleScopes.NotFound` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:8` | `auth` | |
| `USER_ROLE_SCOPES_NO_ASSIGNMENT` | `UserRoleScopes.NoAssignment` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:20` | `auth` | |
| `USER_ROLE_SCOPES_SCOPE_TARGET_NOT_FOUND` | `UserRoleScopes.ScopeTargetNotFound` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:44` | `auth` | |
| `USER_ROLE_SCOPES_USER_ALREADY_ASSIGNED` | `UserRoleScopes.UserAlreadyAssigned` | `Domain/UserRoleScopes/UserRoleScopeErrors.cs:28` | `auth` | |

### 14. `WarehouseCapabilities.*` — 7 uncovered

Backend domain: `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `WAREHOUSE_CAPABILITIES_ALREADY_GRANTED` | `WarehouseCapabilities.AlreadyGranted` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:12` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_ALREADY_REVOKED` | `WarehouseCapabilities.AlreadyRevoked` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:17` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_FORBIDDEN` | `WarehouseCapabilities.Forbidden` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:38` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_MATERIAL_DOMAIN_INACTIVE` | `WarehouseCapabilities.MaterialDomainInactive` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:27` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_MATERIAL_DOMAIN_NOT_FOUND` | `WarehouseCapabilities.MaterialDomainNotFound` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:22` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_NOT_FOUND` | `WarehouseCapabilities.NotFound` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:7` | `warehouse` | |
| `WAREHOUSE_CAPABILITIES_NOT_GRANTED` | `WarehouseCapabilities.NotGranted` | `Domain/WarehouseCapabilities/WarehouseCapabilityErrors.cs:32` | `warehouse` | |

### 15. `WarehouseMaterialSettings.*` — 7 uncovered

Backend domain: `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `WAREHOUSE_MATERIAL_SETTINGS_ALREADY_EXISTS` | `WarehouseMaterialSettings.AlreadyExists` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:12` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_FORBIDDEN` | `WarehouseMaterialSettings.Forbidden` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:37` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_INVALID_RANGE` | `WarehouseMaterialSettings.InvalidRange` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:17` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_MATERIAL_NOT_ACTIVE` | `WarehouseMaterialSettings.MaterialNotActive` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:32` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_MATERIAL_NOT_FOUND` | `WarehouseMaterialSettings.MaterialNotFound` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:27` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_NOT_FOUND` | `WarehouseMaterialSettings.NotFound` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:7` | `warehouse` | |
| `WAREHOUSE_MATERIAL_SETTINGS_WAREHOUSE_CANNOT_HOLD_STOCK` | `WarehouseMaterialSettings.WarehouseCannotHoldStock` | `Domain/WarehouseMaterialSettings/WarehouseMaterialSettingErrors.cs:22` | `warehouse` | |

### 16. `Assets.*` — 6 uncovered

Backend domain: `Application/Assets/GetList/GetAssetsQueryHandler.cs`, `Domain/Assets/AssetErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ASSETS_ASSET_NUMBER_INVALID` | `Assets.AssetNumberInvalid` | `Domain/Assets/AssetErrors.cs:12` | `asset` | |
| `ASSETS_DUPLICATE_ASSET_NUMBER` | `Assets.DuplicateAssetNumber` | `Domain/Assets/AssetErrors.cs:24` | `asset` | |
| `ASSETS_FORBIDDEN` | `Assets.Forbidden` | `Application/Assets/GetList/GetAssetsQueryHandler.cs:27` (+1 more raise site) | `asset` | |
| `ASSETS_REVERSAL_BLOCKED` | `Assets.ReversalBlocked` | `Domain/Assets/AssetErrors.cs:29` | `asset` | |
| `ASSETS_SERIAL_NUMBER_TOO_LONG` | `Assets.SerialNumberTooLong` | `Domain/Assets/AssetErrors.cs:16` | `asset` | |
| `ASSETS_WARRANTY_BEFORE_ACQUISITION` | `Assets.WarrantyBeforeAcquisition` | `Domain/Assets/AssetErrors.cs:20` | `asset` | |

### 17. `Counterparts.*` — 6 uncovered

Backend domain: `Application/Abstractions/Recipients/ICounterpartResolver.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `COUNTERPARTS_INACTIVE` | `Counterparts.Inactive` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:55` | `shared` | |
| `COUNTERPARTS_NOT_FOUND` | `Counterparts.NotFound` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:51` | `shared` | |
| `COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE` | `Counterparts.OperationalRequiresNonEmployee` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:65` | `shared` | |
| `COUNTERPARTS_OUTSIDE_SCOPE` | `Counterparts.OutsideScope` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:59` | `shared` | |
| `COUNTERPARTS_PERSONAL_REQUIRES_EMPLOYEE` | `Counterparts.PersonalRequiresEmployee` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:62` | `shared` | |
| `COUNTERPARTS_TYPE_INVALID` | `Counterparts.TypeInvalid` | `Application/Abstractions/Recipients/ICounterpartResolver.cs:48` | `shared` | |

### 18. `ReceivingInfo.*` — 6 uncovered

Backend domain: `Domain/ReceivingInfo/ReceivingInfoErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `RECEIVING_INFO_RECEIVING_TYPE_INVALID` | `ReceivingInfo.ReceivingTypeInvalid` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:29` | `receiving` | |
| `RECEIVING_INFO_REQUIRED` | `ReceivingInfo.Required` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:7` | `receiving` | |
| `RECEIVING_INFO_SUPPLIER_INVOICE_REF_TOO_LONG` | `ReceivingInfo.SupplierInvoiceRefTooLong` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:25` | `receiving` | |
| `RECEIVING_INFO_SUPPLIER_PARTY_NOT_FOUND` | `ReceivingInfo.SupplierPartyNotFound` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:21` | `receiving` | |
| `RECEIVING_INFO_SUPPLIER_REF_INVALID` | `ReceivingInfo.SupplierRefInvalid` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:17` | `receiving` | |
| `RECEIVING_INFO_WRONG_DOCUMENT_TYPE` | `ReceivingInfo.WrongDocumentType` | `Domain/ReceivingInfo/ReceivingInfoErrors.cs:12` | `receiving` | |

### 19. `TransferInfos.*` — 6 uncovered

Backend domain: `Domain/TransferInfos/TransferInfoErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `TRANSFER_INFOS_ASSET_LINES_NOT_SUPPORTED` | `TransferInfos.AssetLinesNotSupported` | `Domain/TransferInfos/TransferInfoErrors.cs:30` | `transfer` | |
| `TRANSFER_INFOS_DESTINATION_REQUIRED` | `TransferInfos.DestinationRequired` | `Domain/TransferInfos/TransferInfoErrors.cs:22` | `transfer` | |
| `TRANSFER_INFOS_DESTINATION_SAME_AS_SOURCE` | `TransferInfos.DestinationSameAsSource` | `Domain/TransferInfos/TransferInfoErrors.cs:17` | `transfer` | |
| `TRANSFER_INFOS_REQUIRED` | `TransferInfos.Required` | `Domain/TransferInfos/TransferInfoErrors.cs:7` | `transfer` | |
| `TRANSFER_INFOS_TRANSFER_REASON_INVALID` | `TransferInfos.TransferReasonInvalid` | `Domain/TransferInfos/TransferInfoErrors.cs:26` | `transfer` | |
| `TRANSFER_INFOS_WRONG_DOCUMENT_TYPE` | `TransferInfos.WrongDocumentType` | `Domain/TransferInfos/TransferInfoErrors.cs:12` | `transfer` | |

### 20. `WarehouseDocuments.*` — 6 uncovered

Backend domain: `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `WAREHOUSE_DOCUMENTS_COMPLETE_DRAFT_ASSET_SELECTION_COUNT` | `WarehouseDocuments.CompleteDraftAssetSelectionCount` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:49` | `warehouse` | |
| `WAREHOUSE_DOCUMENTS_COMPLETE_DRAFT_DETAILS_MISMATCH` | `WarehouseDocuments.CompleteDraftDetailsMismatch` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:44` | `warehouse` | |
| `WAREHOUSE_DOCUMENTS_COMPLETE_DRAFT_UNSUPPORTED_TYPE` | `WarehouseDocuments.CompleteDraftUnsupportedType` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:39` | `warehouse` | |
| `WAREHOUSE_DOCUMENTS_FORBIDDEN` | `WarehouseDocuments.Forbidden` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:89` | `warehouse` | |
| `WAREHOUSE_DOCUMENTS_NOT_FOUND` | `WarehouseDocuments.NotFound` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:8` | `warehouse` | |
| `WAREHOUSE_DOCUMENTS_POSTING_STRATEGY_NOT_AVAILABLE` | `WarehouseDocuments.PostingStrategyNotAvailable` | `Domain/WarehouseDocuments/WarehouseDocumentErrors.cs:64` | `warehouse` | |

### 21. `InventoryBalances.*` — 5 uncovered

Backend domain: `Domain/InventoryBalances/InventoryBalanceErrors.cs`, `Infrastructure/Ledger/InventoryBalanceRebuilder.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `INVENTORY_BALANCES_FORBIDDEN` | `InventoryBalances.Forbidden` | `Domain/InventoryBalances/InventoryBalanceErrors.cs:7` | `inventory` | |
| `INVENTORY_BALANCES_INSUFFICIENT_QUANTITY` | `InventoryBalances.InsufficientQuantity` | `Domain/InventoryBalances/InventoryBalanceErrors.cs:17` | `inventory` | |
| `INVENTORY_BALANCES_NEGATIVE_QUANTITY` | `InventoryBalances.NegativeQuantity` | `Domain/InventoryBalances/InventoryBalanceErrors.cs:11` | `inventory` | |
| `INVENTORY_BALANCES_REBUILD_ACTOR_REQUIRED` | `InventoryBalances.RebuildActorRequired` | `Infrastructure/Ledger/InventoryBalanceRebuilder.cs:20` | `inventory` | |
| `INVENTORY_BALANCES_REBUILD_TIME_MUST_BE_UTC` | `InventoryBalances.RebuildTimeMustBeUtc` | `Infrastructure/Ledger/InventoryBalanceRebuilder.cs:27` | `inventory` | |

### 22. `MaterialCategories.*` — 5 uncovered

Backend domain: `Domain/MaterialCategories/MaterialCategoryErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `MATERIAL_CATEGORIES_CIRCULAR_PARENT` | `MaterialCategories.CircularParent` | `Domain/MaterialCategories/MaterialCategoryErrors.cs:23` | `catalog` | |
| `MATERIAL_CATEGORIES_FORBIDDEN` | `MaterialCategories.Forbidden` | `Domain/MaterialCategories/MaterialCategoryErrors.cs:27` | `catalog` | |
| `MATERIAL_CATEGORIES_MATERIAL_DOMAIN_NOT_FOUND` | `MaterialCategories.MaterialDomainNotFound` | `Domain/MaterialCategories/MaterialCategoryErrors.cs:11` | `catalog` | |
| `MATERIAL_CATEGORIES_PARENT_IN_DIFFERENT_DOMAIN` | `MaterialCategories.ParentInDifferentDomain` | `Domain/MaterialCategories/MaterialCategoryErrors.cs:19` | `catalog` | |
| `MATERIAL_CATEGORIES_PARENT_NOT_FOUND` | `MaterialCategories.ParentNotFound` | `Domain/MaterialCategories/MaterialCategoryErrors.cs:15` | `catalog` | |

### 23. `OrganizationalUnits.*` — 5 uncovered

Backend domain: `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ORGANIZATIONAL_UNITS_FORBIDDEN` | `OrganizationalUnits.Forbidden` | `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs:23` | `organization` | |
| `ORGANIZATIONAL_UNITS_NOT_FOUND` | `OrganizationalUnits.NotFound` | `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs:7` | `organization` | |
| `ORGANIZATIONAL_UNITS_PARENT_IN_DIFFERENT_SITE` | `OrganizationalUnits.ParentInDifferentSite` | `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs:19` | `organization` | |
| `ORGANIZATIONAL_UNITS_PARENT_NOT_FOUND` | `OrganizationalUnits.ParentNotFound` | `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs:15` | `organization` | |
| `ORGANIZATIONAL_UNITS_SITE_NOT_FOUND` | `OrganizationalUnits.SiteNotFound` | `Domain/OrganizationalUnits/OrganizationalUnitErrors.cs:11` | `organization` | |

### 24. `Warehouses.*` — 5 uncovered

Backend domain: `Domain/Warehouses/WarehouseErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `WAREHOUSES_FORBIDDEN` | `Warehouses.Forbidden` | `Domain/Warehouses/WarehouseErrors.cs:62` | `warehouse` | |
| `WAREHOUSES_INACTIVE` | `Warehouses.Inactive` | `Domain/Warehouses/WarehouseErrors.cs:42` | `warehouse` | |
| `WAREHOUSES_ORGANIZATIONAL_UNIT_NOT_FOUND` | `Warehouses.OrganizationalUnitNotFound` | `Domain/Warehouses/WarehouseErrors.cs:27` | `warehouse` | |
| `WAREHOUSES_ROW_VERSION_MISMATCH` | `Warehouses.RowVersionMismatch` | `Domain/Warehouses/WarehouseErrors.cs:52` | `warehouse` | |
| `WAREHOUSES_SITE_NOT_FOUND` | `Warehouses.SiteNotFound` | `Domain/Warehouses/WarehouseErrors.cs:17` | `warehouse` | |

### 25. `CustodyHistories.*` — 4 uncovered

Backend domain: `Domain/CustodyHistories/CustodyHistoryErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `CUSTODY_HISTORIES_IDENTITY_REQUIRED` | `CustodyHistories.IdentityRequired` | `Domain/CustodyHistories/CustodyHistoryErrors.cs:7` | `custody` | |
| `CUSTODY_HISTORIES_NOTE_TOO_LONG` | `CustodyHistories.NoteTooLong` | `Domain/CustodyHistories/CustodyHistoryErrors.cs:10` | `custody` | |
| `CUSTODY_HISTORIES_STATUS_INVALID` | `CustodyHistories.StatusInvalid` | `Domain/CustodyHistories/CustodyHistoryErrors.cs:8` | `custody` | |
| `CUSTODY_HISTORIES_TRANSITION_INVALID` | `CustodyHistories.TransitionInvalid` | `Domain/CustodyHistories/CustodyHistoryErrors.cs:9` | `custody` | |

### 26. `Employees.*` — 4 uncovered

Backend domain: `Domain/Employees/EmployeeErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `EMPLOYEES_EMPLOYEE_NUMBER_NOT_UNIQUE` | `Employees.EmployeeNumberNotUnique` | `Domain/Employees/EmployeeErrors.cs:11` | `organization` | |
| `EMPLOYEES_FORBIDDEN` | `Employees.Forbidden` | `Domain/Employees/EmployeeErrors.cs:19` | `organization` | |
| `EMPLOYEES_NOT_FOUND` | `Employees.NotFound` | `Domain/Employees/EmployeeErrors.cs:7` | `organization` | |
| `EMPLOYEES_ORGANIZATIONAL_UNIT_NOT_FOUND` | `Employees.OrganizationalUnitNotFound` | `Domain/Employees/EmployeeErrors.cs:15` | `organization` | |

### 27. `ExternalParties.*` — 4 uncovered

Backend domain: `Domain/ExternalParties/ExternalPartyErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `EXTERNAL_PARTIES_CODE_NOT_UNIQUE` | `ExternalParties.CodeNotUnique` | `Domain/ExternalParties/ExternalPartyErrors.cs:15` | `organization` | |
| `EXTERNAL_PARTIES_FORBIDDEN` | `ExternalParties.Forbidden` | `Domain/ExternalParties/ExternalPartyErrors.cs:19` | `organization` | |
| `EXTERNAL_PARTIES_NAME_NOT_UNIQUE` | `ExternalParties.NameNotUnique` | `Domain/ExternalParties/ExternalPartyErrors.cs:11` | `organization` | |
| `EXTERNAL_PARTIES_ROW_VERSION_MISMATCH` | `ExternalParties.RowVersionMismatch` | `Domain/ExternalParties/ExternalPartyErrors.cs:23` | `organization` | |

### 28. `StockMovements.*` — 4 uncovered

Backend domain: `Domain/StockMovements/StockMovementErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `STOCK_MOVEMENTS_DELTA_MUST_NOT_BE_ZERO` | `StockMovements.DeltaMustNotBeZero` | `Domain/StockMovements/StockMovementErrors.cs:16` | `inventory` | |
| `STOCK_MOVEMENTS_DUPLICATE_POSTING` | `StockMovements.DuplicatePosting` | `Domain/StockMovements/StockMovementErrors.cs:20` | `inventory` | |
| `STOCK_MOVEMENTS_FORBIDDEN` | `StockMovements.Forbidden` | `Domain/StockMovements/StockMovementErrors.cs:7` | `inventory` | |
| `STOCK_MOVEMENTS_NOT_FOUND` | `StockMovements.NotFound` | `Domain/StockMovements/StockMovementErrors.cs:11` | `inventory` | |

### 29. `MaterialFamilies.*` — 3 uncovered

Backend domain: `Domain/MaterialFamilies/MaterialFamilyErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `MATERIAL_FAMILIES_CATEGORY_NOT_FOUND` | `MaterialFamilies.CategoryNotFound` | `Domain/MaterialFamilies/MaterialFamilyErrors.cs:11` | `catalog` | |
| `MATERIAL_FAMILIES_FORBIDDEN` | `MaterialFamilies.Forbidden` | `Domain/MaterialFamilies/MaterialFamilyErrors.cs:15` | `catalog` | |
| `MATERIAL_FAMILIES_NOT_FOUND` | `MaterialFamilies.NotFound` | `Domain/MaterialFamilies/MaterialFamilyErrors.cs:7` | `catalog` | |

### 30. `Organizations.*` — 3 uncovered

Backend domain: `Domain/Organizations/OrganizationErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ORGANIZATIONS_CODE_NOT_UNIQUE` | `Organizations.CodeNotUnique` | `Domain/Organizations/OrganizationErrors.cs:11` | `organization` | |
| `ORGANIZATIONS_FORBIDDEN` | `Organizations.Forbidden` | `Domain/Organizations/OrganizationErrors.cs:15` | `organization` | |
| `ORGANIZATIONS_NOT_FOUND` | `Organizations.NotFound` | `Domain/Organizations/OrganizationErrors.cs:7` | `organization` | |

### 31. `UnitsOfMeasure.*` — 3 uncovered

Backend domain: `Domain/UnitsOfMeasure/UnitOfMeasureErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `UNITS_OF_MEASURE_FORBIDDEN` | `UnitsOfMeasure.Forbidden` | `Domain/UnitsOfMeasure/UnitOfMeasureErrors.cs:11` | `catalog` | |
| `UNITS_OF_MEASURE_IN_USE` | `UnitsOfMeasure.InUse` | `Domain/UnitsOfMeasure/UnitOfMeasureErrors.cs:15` | `catalog` | |
| `UNITS_OF_MEASURE_NOT_FOUND` | `UnitsOfMeasure.NotFound` | `Domain/UnitsOfMeasure/UnitOfMeasureErrors.cs:7` | `catalog` | |

### 32. `AssetMovementHistories.*` — 2 uncovered

Backend domain: `Domain/AssetMovementHistories/AssetMovementHistoryErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ASSET_MOVEMENT_HISTORIES_IDENTITY_REQUIRED` | `AssetMovementHistories.IdentityRequired` | `Domain/AssetMovementHistories/AssetMovementHistoryErrors.cs:7` | `asset` | |
| `ASSET_MOVEMENT_HISTORIES_MOVEMENT_TYPE_INVALID` | `AssetMovementHistories.MovementTypeInvalid` | `Domain/AssetMovementHistories/AssetMovementHistoryErrors.cs:8` | `asset` | |

### 33. `Disposals.*` — 2 uncovered

Backend domain: `Domain/InventoryAdjustments/DisposalErrors.cs`, `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `DISPOSALS_REVERSAL_NOT_ALLOWED` | `Disposals.ReversalNotAllowed` | `Domain/InventoryAdjustments/InventoryAdjustmentErrors.cs:16` | `adjustment` | |
| `DISPOSALS_UNSUPPORTED_STATE` | `Disposals.UnsupportedState` | `Domain/InventoryAdjustments/DisposalErrors.cs:9` | `adjustment` | |

### 34. `RolePermissions.*` — 2 uncovered

Backend domain: `Domain/Roles/RolePermissionErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ROLE_PERMISSIONS_ALREADY_ASSIGNED` | `RolePermissions.AlreadyAssigned` | `Domain/Roles/RolePermissionErrors.cs:7` | `auth` | |
| `ROLE_PERMISSIONS_NOT_ASSIGNED` | `RolePermissions.NotAssigned` | `Domain/Roles/RolePermissionErrors.cs:11` | `auth` | |

### 35. `Roles.*` — 2 uncovered

Backend domain: `Domain/Roles/RoleErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `ROLES_FORBIDDEN` | `Roles.Forbidden` | `Domain/Roles/RoleErrors.cs:44` | `auth` | |
| `ROLES_NOT_FOUND` | `Roles.NotFound` | `Domain/Roles/RoleErrors.cs:10` | `auth` | |

### 36. `Sites.*` — 2 uncovered

Backend domain: `Domain/Sites/SiteErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `SITES_FORBIDDEN` | `Sites.Forbidden` | `Domain/Sites/SiteErrors.cs:23` | `organization` | |
| `SITES_ORGANIZATION_NOT_FOUND` | `Sites.OrganizationNotFound` | `Domain/Sites/SiteErrors.cs:19` | `organization` | |

### 37. `WarehouseCapabilityOperations.*` — 2 uncovered

Backend domain: `Domain/WarehouseCapabilityOperations/WarehouseCapabilityOperationErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `WAREHOUSE_CAPABILITY_OPERATIONS_FORBIDDEN` | `WarehouseCapabilityOperations.Forbidden` | `Domain/WarehouseCapabilityOperations/WarehouseCapabilityOperationErrors.cs:28` | `warehouse` | |
| `WAREHOUSE_CAPABILITY_OPERATIONS_NOT_FOUND` | `WarehouseCapabilityOperations.NotFound` | `Domain/WarehouseCapabilityOperations/WarehouseCapabilityOperationErrors.cs:8` | `warehouse` | |

### 38. `DocumentAttachments.*` — 1 uncovered

Backend domain: `Domain/DocumentAttachments/DocumentAttachmentErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `DOCUMENT_ATTACHMENTS_CONTENT_NOT_FOUND` | `DocumentAttachments.ContentNotFound` | `Domain/DocumentAttachments/DocumentAttachmentErrors.cs:75` | `warehouse` | |

### 39. `DocumentSequences.*` — 1 uncovered

Backend domain: `Domain/DocumentSequences/DocumentSequenceErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `DOCUMENT_SEQUENCES_SITE_NOT_FOUND` | `DocumentSequences.SiteNotFound` | `Domain/DocumentSequences/DocumentSequenceErrors.cs:8` | `warehouse` | |

### 40. `General.*` — 1 uncovered

Backend domain: `SharedKernel/Error.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `GENERAL_NULL` | `General.Null` | `SharedKernel/Error.cs:7` | `shared` | |

### 41. `Idempotency.*` — 1 uncovered

Backend domain: `Domain/Idempotency/IdempotencyErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `IDEMPOTENCY_KEY_REUSED` | `Idempotency.KeyReused` | `Domain/Idempotency/IdempotencyErrors.cs:7` | `warehouse` | |

### 42. `MaterialDomains.*` — 1 uncovered

Backend domain: `Domain/MaterialDomains/MaterialDomainErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `MATERIAL_DOMAINS_FORBIDDEN` | `MaterialDomains.Forbidden` | `Domain/MaterialDomains/MaterialDomainErrors.cs:15` | `catalog` | |

### 43. `Reports.*` — 1 uncovered

Backend domain: `Application/Reports/ReportErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `REPORTS_FORBIDDEN` | `Reports.Forbidden` | `Application/Reports/ReportErrors.cs:7` | `reports` | |

### 44. `Returns.*` — 1 uncovered

Backend domain: `Application/Returns/GetEligibleItems/GetReturnEligibleItemsQueryHandler.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `RETURNS_UNAUTHORIZED` | `Returns.Unauthorized` | `Application/Returns/GetEligibleItems/GetReturnEligibleItemsQueryHandler.cs:48` | `issue` | |

### 45. `Users.*` — 1 uncovered

Backend domain: `Domain/Users/UserErrors.cs`

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `USERS_ADMINISTRATOR_RECOVERY_UNAVAILABLE` | `Users.AdministratorRecoveryUnavailable` | `Domain/Users/UserErrors.cs:31` | `auth` | |

### 46. Envelope / shared-kernel codes with no dotted aggregate prefix — 1 uncovered

| Wire code (table key) | Dotted literal | Defined at | Frontend module | Owner notes |
| --- | --- | --- | --- | --- |
| `REFRESH_TOKEN_BODY_DISABLED` | `REFRESH_TOKEN_BODY_DISABLED` | `Web.Api/Infrastructure/RefreshTokenTransport.cs:15` | `shared` | |

## Definition of done for this backlog

1. A named Arabic content owner has authored or approved `titleAr` (and
   `detailAr` where it earns its place) for every row, in batches by aggregate.
2. `arabicCopyForCode` returns non-null for all 384 codes —
   add a drift guard asserting that, so the gap cannot silently reopen.
3. The single orphan key is either removed or reconciled with the backend.
4. Arabic renders correctly in the UI; the table stays valid UTF-8 with no
   U+FFFD (the mojibake some terminals show is a console rendering artifact).
