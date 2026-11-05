# EIAMS — Architecture Overview v1.0

> Enterprise Inventory & Asset Management System  
> الهيئة العامة للرقابة والتفتيش — Syrian General Authority for Oversight and Inspection  
> July 2026

---

## 1. What Is This Document?

A high-level architectural reference for developers, technical leads, and reviewers. It answers **how the system works** — the layers, patterns, data flow, and key decisions — so you can understand the whole system in ~15 minutes without reading the full PRD or the ERD.

**Related documents:**

| Document | Purpose |
|----------|---------|
| `docs/PRD.md` | Requirements, features, process flows (the frontend repo's decision-record copy; the canonical text is the system repo's `docs/PRD.md` — see `AGENTS.md`) |
| `docs/business-domain-model-v1.md` | Canonical v1 domain model for the frontend and contract planning |
| `docs/SAD.md` | System analysis and design; §9.1 is the source of the wire-contract design rules |
| `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md` | ADR-0001, the handwritten per-module wire contract decision (D-INT-02) |
| `docs/ui-design.md` | The approved visual language that `docs/design-tokens.md` implements |

---

## 2. Architectural Philosophy

### 2.1 Document-Driven

Every stock change is driven by a **document**. No direct edits to balances. The document is the single source of truth:

```
User Action → WarehouseDocument → StockMovement → InventoryBalance (updated)
```

### 2.2 Spine + Petals

One unified table (`WarehouseDocument`) for all document types, with 1:1 extension tables per type:

```
WarehouseDocument (Spine)      ← shared fields, lifecycle, numbering
  ├── ReceivingInfo (Petal)    ← supplier, invoice
  ├── IssueTo (Petal)          ← recipient (polymorphic)
  ├── TransferInfo (Petal)     ← destination warehouse
  └── InventoryAdjustment      ← count-linked adjustment
```

Adding a new document type = adding a new Petal table only. No schema changes to the Spine.

### 2.3 Immutable Ledgers

All audit-critical data is **append-only**:

| Ledger | Tracks |
|--------|--------|
| StockMovement | Every inventory quantity change |
| CustodyHistory | Every custody assignment/return |
| AssetMovementHistory | Every asset location change |
| AuditLog + AuditLogEntry | Every Create/Update/Delete/Approve/Post |

No UPDATE or DELETE on these tables — ever.

### 2.4 Derive, Don't Duplicate

Wherever possible, state is **derived** from the ledger rather than stored:

- **Asset.status** → computed via `v_asset_current_status` from Custody + AssetMovementHistory
- **InventoryBalance.quantity** → cached sum of StockMovement.quantity_delta
- **Current custodian** → the open Custody row (status = Active)

This eliminates synchronisation bugs between duplicated fields.

---

## 3. System Layers

```
┌─────────────────────────────────────────────┐
│                Frontend (SPA)                │
│  React 19 · TanStack Query · Zustand        │
│  Tailwind CSS v4 · Base UI · Tabler          │
└──────────────────┬──────────────────────────┘
                   │ HTTPS + JWT
┌──────────────────▼──────────────────────────┐
│              API Layer (ASP.NET)             │
│  Controllers → Validation → Mapping          │
│  handwritten per-module wire types            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│            Domain Services                   │
│  DocumentService · BalanceService            │
│  CustodyService · AssetService               │
│  InventoryCountService · AuditService        │
│  ↓ Each operation enforces:                  │
│    • Permission check (RBAC)                 │
│    • Entity state (valid transition)         │
│    • Business rules (balance, signed copy)   │
│    • Application-layer FK validation         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Repository Layer                   │
│  PostgreSQL 16 · Transactions · Row Locks    │
└─────────────────────────────────────────────┘
```

### 3.1 Separation of Duties

Introduced in v1 via the Submit state (D-WF-01 v2):

```
WH_KEEPER:  Draft → (create, add lines, upload) → Submit → Submitted
WH_MGR:     Submitted → (review) → Post → Posted
                            ↓
                        Reject → Draft
```

This prevents a single user from both creating and finalising a document without oversight.
### 3.2 Frontend source boundaries

The layers above are source boundaries too, and they are enforced in the tree:

- `src/modules/<domain>` owns its feature end to end: pages, components, hooks,
  schemas, services and types. Two modules are deliberately thin — `opening`
  (pages only) and `transfer` (no services or types) — because both are thin
  compositions over the shared document spine, so a service or type layer would
  be scaffolding with nothing to hold.
- `src/shared` owns the document spine, the UI kit, the API transport and the
  infrastructure every feature uses.
- `src/shared` must never import a feature module at RUNTIME. Type-only
  shared→module imports are sanctioned infrastructure (`src/shared/services/api.client.ts`,
  `session-adapter.ts`, `dev-session.ts` each import `AuthTokenResponse` from
  `@/modules/auth/types/session.types`; `src/shared/documents/active-scope.ts` is
  the sanctioned single-point shim into auth). Runtime edges into `auth`
  (session, permission and scope hooks) are treated as infrastructure and are
  sanctioned; runtime edges into a FEATURE module are not.
- The shared document spine no longer imports a feature module (closed 2026-11-05,
  `eiams-frontend-zhg2`): the capability validation reaches both line editors and
  the shared detail page through an optional factory prop that the document pages
  inject (`capabilityValidation={useWarehouseCapabilityValidation}`), the
  material-kind label/policy vocabulary lives under `src/shared/catalog/`, and the
  catalog unit-of-measure and unit-conversion READS live in
  `src/shared/api/catalog-reads.ts` with the catalog hooks depending on them.
- The two scope selectors under `src/shared/scopes/` still bind their own module
  service (`use-scoped-material-selector.ts` -> catalog,
  `use-scoped-warehouse-selector.ts` -> warehouse). That is a recorded decision in
  `docs/cross-feature-dependency-matrix.md`, not an oversight: they are the
  documented page-seam adapters, and moving those two services is a separate slice.

- The two highest-fanout cross-feature scope selectors (`use-scoped-warehouse-selector`,
  `use-scoped-material-selector`) live in `src/shared/scopes/` (promoted from
  `warehouse/hooks/` and `catalog/hooks/` in 2026-11-03; they are genuinely
  shared infrastructure, not any feature's domain contract).
- Every WIRE SHAPE the shared layer owns lives in `src/shared/api/api-contracts.ts`
  — the envelope (`ApiSuccessResponse`, `ApiErrorResponse`, `ApiResponse`), the
  pagination projection (`ApiPaginationResponse`, `ApiPage`), the error shapes
  (`ApiError`, `ApiErrorDetails`) and `ResourceIdResponse`. `src/shared/api/envelope.ts`
  keeps only the runtime helpers over those shapes (`unwrapData`,
  `isApiSuccessResponse`, `isApiErrorResponse`, `readApiError`,
  `readTransportError`, `normalizeWireErrorCode`).
- The shared wire PRIMITIVES live in `src/shared/types/wire-primitives.ts`:
  `Uuid`, `RecordStatus` (the read side), `RecordStatusOrdinal` /
  `RecordStatusCommandValue` (the write side), `statusCommandValue` and
  `NamedReference`. Feature-specific wire vocabularies live in
  `src/shared/types/catalog.wire-types.ts` and
  `src/shared/types/warehouse.wire-types.ts`; the shared scope vocabulary lives
  in `src/shared/types/scope.types.ts`. None of these is a global type registry:
  each file is a narrow, deliberate extraction of a contract the shared spine
  genuinely needs.

The audit that produced this arrangement, including the findings that were
withdrawn after verification, is in
`docs/frontend-architecture-audit-2026-11-02.md`.

---

## 4. Core Patterns (Detailed)

### 4.1 Document Lifecycle

```
     ┌──────────────────────────────────────────┐
     │              Draft                       │
     │  Editable · Not final                    │
     └──────────────┬───────────────────────────┘
                    │ Submit (WH_KEEPER)
                    ▼
     ┌──────────────────────────────────────────┐
     │            Submitted                     │
     │  Read-only · Awaiting review             │
     └──────────────┬───────────────────────────┘
            ┌───────┴───────┐
            │               │
       Reject (WH_MGR)   Post (WH_MGR)
            │               │
            ▼               ▼
        Draft            Posted
                         │
                    (optional)
                         ▼
                     Reversed
```

**Transitions:** `Draft ⇄ Submitted ⇄ Posted ⇄ Reversed`  
**Pre-post cancellation:** `Draft → Cancelled` or `Submitted → Cancelled`  
**Access control:** Only `Draft` is editable; `Submitted` is read-only; `Posted` is immutable.

### 4.2 Polymorphic Associations

`IssueTo` and `Custody` use `(type, id)` pairs instead of foreign keys:

| Table | Type Field | ID Field | Target Entities |
|-------|-----------|----------|-----------------|
| IssueTo | recipient_type | recipient_id | Employee, OrganizationalUnit, Site, ExternalEntity |
| Custody | holder_type | holder_id | Employee, OrganizationalUnit |

**Enforcement strategy (D-POLY-01):**
1. Application-layer: every service validates existence + active status before write
2. `CHECK` trigger: `recipient_id/holder_id IS NOT NULL` when document is Posted / custody is Active
3. Daily housekeeping job: audits orphaned references and alerts admin

### 4.3 Balance & Stock Movement

```
InventoryBalance
  ├── warehouse_id (FK)
  ├── material_id (FK)
  └── quantity (DECIMAL 18,3) — cached sum

StockMovement (append-only)
  ├── document_id (FK) → WarehouseDocument
  ├── line_id (FK) → DocumentLine
  ├── movement_type (Receipt/Issue/TransferIn/TransferOut/Adjustment/Opening)
  ├── quantity_delta (signed)
  └── UNIQUE(document_id, line_id, movement_type) ← prevents duplicates
```

**Transaction flow for posting:**
```
BEGIN;
  SELECT quantity FROM InventoryBalance
  WHERE warehouse_id = X AND material_id = Y
  FOR UPDATE;   ← row lock prevents race
  
  INSERT INTO StockMovement (...);   ← append movement
  UPDATE InventoryBalance SET quantity = quantity + delta;  ← update cache
COMMIT;
```

### 4.4 Audit Logging (D-AUD-01)

Two-table model:

```
AuditLog (header)
  ├── entity_type, entity_id, action (Create/Update/Delete/Approve/Post)
  ├── summary (JSONB, optional — for quick context)
  └── user_id, ip_address, created_at

AuditLogEntry (per-field detail)
  ├── log_id (FK → AuditLog)
  ├── field_name, old_value, new_value (all TEXT)
  └── enables indexed search: "who changed the price of material X?"
```

### 4.5 Warehouse Capability (D-CAP-01)

Instead of BOOLEAN columns, an expandable child table:

```
WarehouseCapability
  ├── warehouse_id + domain_id (which domains a warehouse can handle)
  └── WarehouseCapabilityOperation
        ├── capability_id (FK)
        └── operation_type (Receiving/Issue/Transfer/Count/Return)
```

Adding `Return` operation in v2 = INSERT a row, not ALTER TABLE.

### 4.6 Material Family Inheritance

`MaterialFamily` may carry default attribute hints that `Material` overrides via `COALESCE`:

| Source | `material_kind` | `requires_asset_number` | `decimal_precision` |
|--------|----------------|------------------------|-------------------|
| MaterialFamily | Consumable (default) | FALSE (default) | 3 (default) |
| Material (override) | Asset | TRUE | 0 |

Logic: `COALESCE(Material.field, Family.field, global_default)`

---

## 5. Module Map (Domain Boundaries)

```
┌─────────────────────────────────────────────────────┐
│                   Organization                       │
│  Organization → Site → OrganizationalUnit → Employee │
├─────────────────────────────────────────────────────┤
│                    Catalog                           │
│  MaterialDomain → MaterialCategory → MaterialFamily  │
│  → Material · UnitOfMeasure · UnitConversion         │
├─────────────────────────────────────────────────────┤
│                   Warehouse                          │
│  Warehouse · WarehouseCapability · DocumentSequence  │
│  WarehouseCapabilityOperation · MaterialSetting      │
├─────────────────────────────────────────────────────┤
│              Inventory Operations                    │
│  WarehouseDocument → DocumentLine → StockMovement    │
│  ├─ Petals: ReceivingInfo, IssueTo, TransferInfo     │
│  └─ Attachments: DocumentAttachment                  │
├─────────────────────────────────────────────────────┤
│                Count & Adjustment                    │
│  InventoryCount → InventoryCountLine                 │
│  InventoryAdjustment → AdjustmentLine                │
├─────────────────────────────────────────────────────┤
│                 Assets & Custody                     │
│  Asset → AssetMovementHistory                        │
│  Custody → CustodyHistory (polymorphic holder)       │
├─────────────────────────────────────────────────────┤
│                  Supporting                          │
│  User · Role · Permission · AuditLog· AuditLogEntry  │
└─────────────────────────────────────────────────────┘
```

**Cross-cutting:** `User` references every domain (created_by, posted_by, etc.). `AuditLog` tracks all entities.

---

## 6. Key Data Flows

### 6.1 Receiving (example)

```
1. WH_KEEPER → POST /api/documents (type=Receiving)       → Draft
2. WH_KEEPER → POST /api/documents/{id}/lines             → DocumentLine rows
3. WH_KEEPER → POST /api/documents/{id}/attachment        → DocumentAttachment
4. WH_KEEPER → POST /api/documents/{id}/submit            → Submitted
5. WH_MGR    → POST /api/documents/{id}/post              → Posted
                 ├── INSERT StockMovement (Receipt, +qty)
                 ├── UPDATE InventoryBalance (qty + delta)
                 ├── INSERT Asset (if line_type=Asset)
                 └── INSERT AuditLog + AuditLogEntry
```

### 6.2 Query: Current Balance

```
GET /api/balance?warehouse=X&material=Y
  → SELECT quantity FROM InventoryBalance
    WHERE warehouse_id = X AND material_id = Y
```

### 6.3 Query: Asset Current Status

```
SELECT status FROM v_asset_current_status WHERE asset_id = ?
  -- Derived from:
  --   IF EXISTS (Custody WHERE asset_id = ? AND status = 'Active')
  --     AND EXISTS (Custody WHERE holder_type = 'Employee')
  --   THEN 'InCustody'
  --   ELSE IF EXISTS (Custody WHERE asset_id = ? AND status = 'Active')
  --   THEN 'Issued'
  --   ELSE 'InStock'
```

---

## 7. Security & RBAC

### 7.1 Roles

| Role | Scope | Can Post? |
|------|-------|-----------|
| Enterprise WH Manager | Enterprise | Yes (any warehouse) |
| Site Manager | Site | Yes (site warehouses) |
| Warehouse Manager | Single WH | Yes |
| Warehouse Keeper | Single WH | **No** — submits only |
| Auditor | Read-only | No |

### 7.2 Permission Enforcement

- **UI:** Conditional rendering (buttons, menus hidden without permission)
- **API:** Attribute-based authorization on every endpoint
- **DB:** Row-level security is NOT used in v1 — all enforcement is application-layer

---

## 8. Operational Constraints

### 8.1 Negative Stock

`Issue` is blocked when `InventoryBalance.quantity < requested quantity`.  
No negative stock in v1. A negative-stock override (with audit trail) is deferred to v2.

### 8.2 Count Freeze Policy

`SoftFreeze` only — the system warns when operations overlap with an active count, but does not block.  
`HardFreeze` and `NoFreeze` deferred to v2.

### 8.3 Signed Copy Rule

`document_status = 'Posted'` requires at least one `DocumentAttachment` with `attachment_type = 'SignedOriginal'`.  
Exception handling (lost paper, scanner failure) is managed via admin override with full audit trail.

### 8.4 Cross-Governorate Transfer

Blocked by application-layer policy. Configurable per installation.

### 8.5 Optimistic Concurrency

`row_version` (INTEGER) on all mutable aggregates (InventoryBalance, WarehouseDocument, etc.).  
On update: `UPDATE ... SET row_version = row_version + 1 WHERE row_version = :old_version`.

---

## 9. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 6, Vite 8 |
| UI Library | shadcn-generated Base UI primitives + Tabler icons (RTL-ready) |
| State (server) | TanStack Query v5 |
| State (client) | Zustand v5 |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v9 |
| HTTP Client | Axios (JWT interceptor) |
| API / Backend | ASP.NET Core (.NET 8+) |
| Database | PostgreSQL 16 |
| ORM | Entity Framework Core |
| Auth | JWT (Access + Refresh tokens) |
| API Types | Handwritten per-module wire types (D-INT-02 / ADR-0001) |
| Testing | Vitest + Testing Library + MSW |

---

## 10. Key Decisions Index

| ID | Topic | Summary |
|----|-------|---------|
| D-WF-01 | Workflow | `Draft → Submitted → Posted`. WH_KEEPER submits, WH_MGR posts. |
| D-DOC-01 | Signed copy | Required for posting. `SignedOriginal` vs `Supporting`. |
| D-OPEN-01 | Opening balance | Folded into WarehouseDocument. |
| D-AST-02 | Asset.status | Removed from table, derived via view. |
| D-CAP-01 | Warehouse capability | BOOLEANs replaced by WarehouseCapabilityOperation. |
| D-AUD-01 | Audit granularity | Two-table model: AuditLog + AuditLogEntry. |
| D-POLY-01 | Polymorphic FK | Application enforcement + TRIGGER guard + Housekeeping. |
| D-TRN-01 | Transfer | Atomic (single document, dual movement). Two-phase deferred to v2. |
| D-INV-01 | Balances | Only `quantity`. Reserved/Available/etc. deferred. |
| D-MOV-01 | Ledger | `quantity_delta` (signed), no before/after. |
| D-SEQ-01 | Numbering | Sequence keyed by `(site, document_type, year)`. |
| D-CAT-01 | Domain | Derived via Family→Category. Family is mandatory. |

Full details in `docs/PRD.md` §9 (the frontend decision record) and, for the
ratified system-wide text, the canonical documents in the system repository's
`docs/` — see the doc-ownership rule in `AGENTS.md`.

---

## 11. Deferred to v2

| Feature | Rationale |
|---------|-----------|
| StorageLocation (bin tracking) | Warehouses are small initially |
| MaterialAttribute | JSONB on Material covers this |
| Supplier (entity) | supplier_name + autocomplete suffice |
| Notification (backend) | Frontend-only in v1 |
| Two-phase transfer | Atomic transfer covers v1 needs |
| HardFreeze / NoFreeze | SoftFreeze only |
| Negative-stock override | Admin-controlled in v2 |
| Reserved / Available balances | Single `quantity` field suffices |
| Maintenance module | Asset lifecycle is simplified in v1 |
| TransferRequest lines | Not needed for atomic transfer |
