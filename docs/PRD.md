# Product Requirements Document (PRD) — Enterprise Inventory & Asset Management System (EIAMS)

| | |
|---|---|
| **Document type** | Product Requirements Document (PRD) |
| **Version** | 2.0 — Unified (incorporates the architecture review and v5 decisions) |
| **Owner** | General Authority for Oversight & Inspection |
| **Database** | Schema v5 (embedded in Chapter 10) |
| **Language** | English |
| **Scope** | Business & product requirements; does not mandate specific implementation technologies |

> **Unification note:** This version folds the settled decisions from the architecture review (Chapter 9) directly into the body, and embeds the corrected database design (v5) in Chapter 10. Where anything is ambiguous, Chapters 9 and 10 govern.

---

## Chapter 1 — Executive Summary

### 1.1 Problem
The Authority manages inventory and assets spread across multiple sites and organizational units, relying on paper documents and scattered records. The result is weak balance tracking, difficulty knowing which party or employee is responsible for any asset at any moment, and the absence of a single auditable ledger tying every stock movement to its official document.

### 1.2 Solution
A unified, **Document-Driven** system: no stock movement occurs except through an official, posted document accompanied by its signed paper copy. The system provides a central material catalog, real-time per-warehouse balances, an immutable movement ledger, full asset lifecycle and custody management, and a comprehensive audit log.

### 1.3 Goals
- A single source of truth for balances — every balance explainable by its movements.
- Every stock movement tied to a signed official document (no movement without a document).
- Know the party/employee responsible for each asset at any moment, plus full history.
- Complete, auditable traceability of every operation.
- Make materials available to warehouses by **Domain**, not by manual binding.

### 1.4 Business Value

#### 1.4.1 Operational Value
- Reduce execution time for receiving, issuing, transferring, counting, and searching records.
- Reduce reliance on scattered paper files and records, while retaining signed copies as the official reference.
- Improve balance accuracy and prevent over-issuance.
- Know a material's or asset's status and operational trail without cross-referencing multiple records.

#### 1.4.2 Administrative & Audit Value
- Unified management visibility while preserving each warehouse's independent inventory and movements.
- Accountability through clear identification of who performed the operation, which party is responsible for an asset, and which employee holds personal custody.
- Faster auditing, review, and report generation.
- Reduced risk of unauthorised modification or loss of historical operation records.

#### 1.4.3 Strategic Value
EIAMS is a component of the Authority's digital transformation. It establishes a unified information structure that can later be extended to procurement, HR, finance, maintenance, and e-government services.

### 1.5 First-release scope (v1)
Receiving, Issue, Transfer (atomic), Opening Balance, Inventory Count, Adjustments, Assets, Custody, Roles & Permissions, Audit log.

### 1.6 Out of scope for v1 (deferred to v2)
Maintenance module, notifications, detailed storage locations (StorageLocation), Supplier entity, structured material attributes (MaterialAttribute), two-phase transfer (in-transit balance), and Reserved/Available/Damaged balances. (Details in 10.6.)

---

## Chapter 2 — Business Context

The Authority is a government oversight body that owns warehouses and assets distributed geographically across sites, each tied to organizational units. Users are warehouse keepers, officers, and employees. The signed paper document is the legal basis for every operation; the system digitizes and controls it without removing its official role.

---

## Chapter 3 — Core Concepts

### 3.1 Organizational structure and stock holder
- **Organization → Site → Warehouse**: only the warehouse holds a balance.
- **Organization → Site → OrganizationalUnit → Employee**: the organizational unit is a tree and holds no stock.
- Separating the administrative structure from the stock-holding unit is a binding principle.

### 3.2 Central multi-level catalog
`MaterialDomain → MaterialCategory (tree) → MaterialFamily → Material`. A material is defined once, centrally. **Domain is derived from the category** (no direct material-to-domain link). Family is **mandatory** (v5 decision).

### 3.2.1 Material classification, identity, and accountability
Material kind is authoritative and is not inferred from an identifier. A
`Consumable` is Quantity-tracked, has neither asset number nor custody, and
responsibility ends when its Issue is posted. A `Durable` is Quantity- or
Serial-tracked, never has an asset number, and must remain under custody after
issue. An `Asset` is a fixed accounting classification: it is Serial-tracked,
registered one unit at a time, has an enterprise-unique internal asset number,
and must remain under custody after issue.

`asset_number` is EIAMS's internal fixed-asset identity. `serial_number` is a
manufacturer/operational identifier and may identify a Durable without making
it an Asset. A serial number is never an asset number or capitalization proof.

### 3.2.2 Material units and packaging
Each Material has exactly one base unit. Stock balances, stock movements, and
the canonical quantity in a posted document line are expressed in that unit.
`UnitOfMeasure` names reusable units such as Piece, Carton, Box, and Bag, but
never gives them a global packaging quantity. An alternate unit is related to
one Material only and converts directly to that Material's base unit.

The conversion factor means `1 alternate unit = factor × base units` and is a
positive `DECIMAL(18,6)`. For example, one Carton of blue pens can equal 12
Pieces while one Carton of printer ink equals 6 Boxes. A material whose
commercial and stock unit is Carton simply has Carton as its base unit and has
no conversion. Converted posted lines retain their conversion identity,
factor, and resulting base quantity; a later packaging change cannot
reinterpret history. D-UOM-01 governs this policy.

### 3.3 Domain and Warehouse Capability
A material is made available to a warehouse based on its **domain**, not by binding it manually. `WarehouseCapability` defines, per warehouse, which domains it may handle and which operations are allowed (receiving/issue/transfer/count).

### 3.4 Employee vs. User
`Employee` is an organizational entity (may hold custody); `User` is a login account that may link to an employee. The separation is binding.

### 3.5 Operational responsibility vs. personal custody
Two independent levels of responsibility for accountable property:
- **Operational Responsibility**: the party that received the asset from the warehouse (organizational unit / site / external party).
- **Personal Custody**: the employee personally responsible for the asset.
Issue and custody assignment are distinct operations. An Asset may remain in
operational responsibility before personal assignment. A Durable must also
remain accountable after issue through the D-MAT-01 `MaterialQuantity` or
`TrackedUnit` custody subject; this is not an Asset row.

### 3.6 Unified custody model
The historical Schema v5 `Custody` entity manages Asset responsibility with
one active row per asset. D-MAT-01 extends the provisional OpenAPI custody
projection to Durable `MaterialQuantity` and `TrackedUnit` subjects, including
partial returns. Backend implementation and ratification remain required; this
extension never represents Durable property as an Asset row.

---

## Chapter 4 — Architectural Principles

1. **Document-Driven**: every stock movement (`StockMovement`) is tied to a posted document (`WarehouseDocument`). No direct edits to balances.
2. **Signed copy before posting**: a document is not posted until its signed paper copy is attached and verified. The system distinguishes the signed original from supporting attachments (D-DOC-01).
3. **Immutable ledger**: `StockMovement` is append-only and stores the signed delta (`quantity_delta`); balances are derived from it (D-MOV-01).
4. **Balance as an explainable cache**: `InventoryBalance.quantity` = sum of movements, updated within a locked transaction.
5. **Full traceability**: every operation is recorded in `AuditLog`, with standard audit columns on every row.
6. **Shared header + details**: one shared document, with each type's fields in a 1:1 detail table.

---

## Chapter 5 — Roles & Permissions (RBAC)

- A `Role` ↔ `Permission` model via `RolePermission` (atomic permissions).
- `UserRoleScope` grants a user's role within a **scope**: `Enterprise | Site | Warehouse`.
- The warehouse keeper creates documents and posts them after uploading the signed copy. **There is no manager-approval step in v1** (D-WF-01).

---

## Chapter 6 — Functional Modules

> For each module: purpose, core rules, and effect on movements/states. Full state machines are in Chapter 8.

### 6.1 Receiving
- Enter a receiving document (type `Receiving`) with material lines, quantities, and units; supplier details in `ReceivingInfo`.
- On posting: a positive `Receipt` movement per line and an `InventoryBalance` update.
- Asset materials (`material_kind = Asset`) create one `Asset` per unit (line `line_type = Asset`), with a required internal asset number. `requires_asset_number` is derived by policy and is not an independent condition.
- Posting requires: a signed copy attached, and the warehouse holding the required `WarehouseCapabilityOperation` for the operation and material's domain.

### 6.2 Issue
- An issue document (type `Issue`) with a recipient defined in `IssueTo` (`recipient_type` + `recipient_id`).
- On posting: a negative `Issue` movement and a balance update.
- Issuing an Asset moves it to `Issued` and opens custody for the receiving party. Issuing a Durable also requires custody through D-MAT-01's pending contract extension; issuing a Consumable creates no custody.
- Issue is blocked when the balance is insufficient (per the negative-stock policy).

### 6.3 Transfer — atomic
- A single transfer document (type `Transfer`) with one destination in `TransferInfo` (`destination_warehouse_id`).
- On posting: **two movements in one transaction** — `TransferOut` from source and `TransferIn` into destination — updating both warehouses' balances atomically.
- No in-transit stage and no separate receipt confirmation in v1 (D-TRN-01).

### 6.4 Opening Balance
- Enter starting balances via a `WarehouseDocument` with `document_type = Opening` (D-OPEN-01).
- On posting: a positive `Opening` movement establishes the balance. Uses the standard Spine lifecycle (`Draft → Submitted → Posted → Reversed`).

### 6.5 Inventory Count
- Create a count (`InventoryCount`) with a scope and freeze policy (`HardFreeze | SoftFreeze | NoFreeze`).
- Snapshot balances, enter actual quantities, and compute differences in `InventoryCountLine`.
- Status: `Planned → InProgress → Completed → Closed`.

### 6.6 Adjustments
- An adjustment (`InventoryAdjustment`) arises from count differences or directly, and is posted via a document.
- On posting: `AdjustmentIn`/`AdjustmentOut` movements per the sign of the difference. Status `Draft | Posted | Reversed`.

### 6.7 Assets
- Each Asset has a required enterprise-unique internal `asset_number`, an optional manufacturer `serial_number`, and links to its Asset material and receiving line. The identifiers are not interchangeable.
- Asset states: `InStock | Issued | InCustody | Disposed` (D-AST-01). Maintenance/retirement are out of v1.
- `AssetMovementHistory` records asset movements.

### 6.8 Custody
- The historical persistence model is an Asset timeline with one active row per asset, with `holder_type`/`holder_id`/`custody_kind`.
- D-MAT-01's provisional OpenAPI adds `MaterialQuantity` and `TrackedUnit` custody subjects for Durable property and partial returns. Backend implementation and ratification remain required.
- Assignment and return are tied to documents (`issue_document_id`/`return_document_id`). Status `Active | Closed`.
- `CustodyHistory` records state changes.

---

## Chapter 7 — Process Flows (v1 path)

The general path for any operational document is simple and direct:

```
Create document (Draft) → Enter lines & details → Upload signed paper copy → Submit (Submitted) → Post (Posted)
                                                                              ↳ Reject → Draft
                                                                              ↳ Cancel (Cancelled)
                                                                              ↳ when needed: reverse via a reversing document (Reversed)
```

- WH_KEEPER creates and submits; only WH_MGR can post (D-WF-01).
- Uploading the signed copy is a precondition to enable posting (D-DOC-01).
- Posting generates the movements and updates balances within a single transaction.

---

## Chapter 8 — State Machines (Canonical)

**Document** (`document_status`): `Draft → Submitted → Posted → Reversed`, with `Rejected` (back to Draft) and `Cancelled` (before posting only).

  - WH_KEEPER creates (Draft) and submits → `Submitted`.
  - WH_MGR reviews and posts → `Posted`, or rejects → back to `Draft`.

**Asset** (derived via `v_asset_current_status` — see D-AST-02): `InStock → Issued → InCustody → (InStock on return) → Disposed`. No `status` column on the `Asset` table; the current state is computed from the latest `Custody` row and `AssetMovementHistory`.

**Custody** (`Custody.status`): `Active → Closed` (a new row opens for each responsibility).

**Count** (`InventoryCount.status`): `Planned → InProgress → Completed → Closed`.

**Adjustment** (`InventoryAdjustment.status`): `Draft → Posted → Reversed`.

General rules: no transition to a disallowed state; every transition is logged in `AuditLog`; `Posted` is never rolled back except by a reversal (`Reversed`); every status field is constrained to its legal values (10.4).

---

## Chapter 9 — Settled Decisions

| ID | Topic | Decision |
|---|---|---|
| **D-WF-01** | Document workflow | `Draft → Submitted → Posted → Reversed` (+ Rejected → Draft, + Cancelled before posting). WH_KEEPER creates and submits; WH_MGR posts. Uploading the signed copy is a prerequisite for posting. This provides Separation of Duties without requiring a full Approve state. |
| **D-DOC-01** | Signed copy | `signed_copy_attachment_id` required when Posted; `attachment_type` distinguishes `SignedOriginal` from `Supporting`. |
| **D-AST-01** | Asset states | One set: `InStock / Issued / InCustody / Disposed`. **Maintenance is out of v1**. |
| **D-CUS-01** | Responsibility & custody | One timeline: `holder_type + holder_id + custody_kind`, one active row per asset, no `current_custody_id`, status `Active/Closed`. |
| **D-MAT-01** | Material classification & accountability | Consumable = Quantity/no asset number/no custody; Durable = Quantity or Serial/no asset number/mandatory custody; Asset = Serial/internal asset number/mandatory custody and registry. Serial number is not asset number. Durable custody requires an explicit subject/partial-return contract. |
| **D-TRN-01** | Transfer | **Atomic** via `TransferInfo` (single destination) — one document + two movements in one transaction. Two-phase transfer deferred to v2. |
| **D-CAT-01** | Domain & family | Domain derived via `Family → Category` (no direct link). **Family is mandatory**. Type is authoritative on `Material` only. |
| **D-INV-01** | Balances | `InventoryBalance = quantity` only. Reserved/Available/In-Transit/Damaged deferred to v2. |
| **D-MOV-01** | Ledger & concurrency | `StockMovement = quantity_delta` (signed) only (no before/after). `row_version` on mutable aggregates. |
| **D-SEQ-01** | Numbering | `DocumentSequence` keyed by `(site_id, document_type, year)`, annual reset, via a database sequence. |
| **D-POLY-01** | Polymorphic FKs | `IssueTo.recipient_id` and `Custody.holder_id` remain UUID (no FK constraint) by design. **Application-layer enforcement is mandatory** — every service must validate the referenced entity exists and is active before write. A scheduled housekeeping job audits orphaned references daily. A `CHECK` trigger guards against `NULL` recipient_id/holder_id when status is Posted/Active. |
| **D-OPEN-01** | Opening Balance | `OpeningBalance` is folded into `WarehouseDocument` as `document_type = Opening`. It uses the shared Spine lifecycle (`Draft → Submitted → Posted → Reversed`), the shared `DocumentLine` table, and `DocumentAttachment` for the signed copy. The separate `OpeningBalance` entity is removed; its columns move to `DocumentLine` with a new `opening_type` flag. |
| **D-AST-02** | Asset status derived | `Asset.status` is **removed** from the schema. The current asset state is derived from the latest `Custody` row (if any) and the `AssetMovementHistory` ledger. A database view `v_asset_current_status` computes `InStock / Issued / InCustody / Disposed` from these two sources. This eliminates the synchronisation gap between `Asset.status` and `Custody.status`. |
| **D-CAP-01** | Warehouse capability | `WarehouseCapability` BOOLEAN columns (`allow_receiving`, `allow_issue`, `allow_transfer`, `allow_count`) are replaced by `WarehouseCapabilityOperation` — a child table with one row per allowed operation per domain. Adding a new operation type (e.g., `Return`) in v2 requires only a new row, not an `ALTER TABLE`. |
| **D-AUD-01** | Audit log granularity | `AuditLog.old_values` / `new_values` JSONB are replaced by a two-table model: `AuditLog` (header with optional JSONB summary) + `AuditLogEntry` (one row per changed field with `field_name`, `old_value`, `new_value`). This enables indexed per-field search and avoids unbounded JSONB bloat. |
| **D-UOM-01** | Material unit conversion | Each Material owns one base unit. An alternate unit converts directly to that base unit by a positive per-material `DECIMAL(18,6)` factor; units have no global packaging factor. A used conversion is archived/deactivated and replaced, never overwritten or deleted, and posted lines retain conversion/factor/base-quantity snapshots. |

---


## Chapter 10 — Database Design (Schema v5)

This section is generated directly from — and matches — the ERD v5. Entities are grouped by domain; each entity lists its columns and keys. Enumerations and constraints follow at the end.

### 10.1 Overview

The first release comprises **38 entities** and **59 relationships**. Operational documents use a **Shared Header + Details** pattern (Spine + Petals): a single `WarehouseDocument` header holds the shared fields, with 1:1 detail tables per type (`ReceivingInfo`, `IssueTo`, `TransferInfo`). Key schema changes from v4 to v5: (a) `OpeningBalance` folded into `WarehouseDocument` as a document type, (b) `WarehouseCapability` BOOLEAN columns replaced by `WarehouseCapabilityOperation` child table, (c) `Asset.status` removed and derived via view, (d) `AuditLog` split into header + per-field entries.

### Domain: Organization & Structure

#### `Organization`
The legal entity that owns the system.

| Column | Type | Key | Description |
|---|---|---|---|
| `organization_id` | UUID | PK |  |
| `name` | VARCHAR(200) |  | organization name |
| `code` | VARCHAR(50) | UNIQUE |  |
| `status` | VARCHAR(20) |  | Active / Inactive |

#### `Site`
Geographic site under the organization.

| Column | Type | Key | Description |
|---|---|---|---|
| `site_id` | UUID | PK |  |
| `organization_id` | UUID | FK | → Organization |
| `name` | VARCHAR(200) |  |  |
| `code` | VARCHAR(50) | UNIQUE |  |
| `location` | VARCHAR(300) |  |  |
| `status` | VARCHAR(20) |  | Active / Inactive |

#### `OrganizationalUnit`
Administrative unit within a site (tree). Holds no stock.

| Column | Type | Key | Description |
|---|---|---|---|
| `org_unit_id` | UUID | PK |  |
| `site_id` | UUID | FK | → Site |
| `parent_id` | UUID | FK | → OrganizationalUnit (nullable) |
| `name` | VARCHAR(200) |  |  |
| `unit_type` | VARCHAR(50) |  |  |
| `status` | VARCHAR(20) |  | Active / Inactive |

#### `Employee`
Employee belonging to an organizational unit.

| Column | Type | Key | Description |
|---|---|---|---|
| `employee_id` | UUID | PK |  |
| `org_unit_id` | UUID | FK | → OrganizationalUnit |
| `full_name` | VARCHAR(200) |  |  |
| `employee_number` | VARCHAR(50) | UNIQUE |  |
| `job_title` | VARCHAR(100) |  |  |
| `status` | VARCHAR(20) |  | Active / Inactive |

### Domain: Security & Permissions

#### `User`
Login account linked to an employee (separate from Employee).

| Column | Type | Key | Description |
|---|---|---|---|
| `user_id` | UUID | PK |  |
| `employee_id` | UUID | FK | → Employee (nullable) |
| `username` | VARCHAR(100) | UNIQUE |  |
| `email` | VARCHAR(200) |  |  |
| `status` | VARCHAR(20) |  | Active / Suspended |
| `last_login` | TIMESTAMP |  | nullable |

#### `Role`
Functional role.

| Column | Type | Key | Description |
|---|---|---|---|
| `role_id` | UUID | PK |  |
| `name` | VARCHAR(100) | UNIQUE |  |
| `description` | TEXT |  |  |

#### `Permission`
Atomic permission.

| Column | Type | Key | Description |
|---|---|---|---|
| `permission_id` | UUID | PK |  |
| `code` | VARCHAR(100) | UNIQUE |  |
| `description` | TEXT |  |  |

#### `RolePermission`
Role-to-permission mapping (N:M).

| Column | Type | Key | Description |
|---|---|---|---|
| `role_id` | UUID | FK/PK | → Role |
| `permission_id` | UUID | FK/PK | → Permission |

#### `UserRoleScope`
A user role within a specific scope.

| Column | Type | Key | Description |
|---|---|---|---|
| `user_role_scope_id` | UUID | PK |  |
| `user_id` | UUID | FK | → User |
| `role_id` | UUID | FK | → Role |
| `scope_type` | VARCHAR(20) |  | Enterprise / Site / Warehouse |
| `scope_id` | UUID |  | scope id (nullable for Enterprise) |

### Domain: Material Catalog

#### `MaterialDomain`
Top-level domain (drives warehouse availability).

| Column | Type | Key | Description |
|---|---|---|---|
| `material_domain_id` | UUID | PK |  |
| `name` | VARCHAR(200) |  |  |
| `code` | VARCHAR(50) | UNIQUE |  |
| `status` | VARCHAR(20) |  | Active / Inactive |

#### `MaterialCategory`
Tree-structured category within a domain.

| Column | Type | Key | Description |
|---|---|---|---|
| `category_id` | UUID | PK |  |
| `material_domain_id` | UUID | FK | → MaterialDomain |
| `parent_category_id` | UUID | FK | → MaterialCategory (nullable) |
| `name` | VARCHAR(200) |  |  |
| `code` | VARCHAR(50) |  |  |
| `status` | VARCHAR(20) |  |  |

#### `MaterialFamily`
Mandatory grouping family (fourth level).

| Column | Type | Key | Description |
|---|---|---|---|
| `family_id` | UUID | PK |  |
| `category_id` | UUID | FK | → MaterialCategory |
| `name` | VARCHAR(200) |  |  |
| `code` | VARCHAR(50) |  |  |
| `status` | VARCHAR(20) |  |  |
| | | | ⚠ ⚠ carries no tracking/kind — type is authoritative on Material only |

#### `Material`
Material. Domain is derived via Family→Category (no direct domain FK).

| Column | Type | Key | Description |
|---|---|---|---|
| `material_id` | UUID | PK |  |
| `family_id` | UUID | FK | → MaterialFamily (mandatory) |
| `name_ar` | VARCHAR(500) |  |  |
| `name_en` | VARCHAR(500) |  | nullable |
| `code` | VARCHAR(100) | UNIQUE |  |
| `material_kind` | VARCHAR(20) |  | Consumable / Durable / Asset — authoritative |
| `tracking_type` | VARCHAR(20) |  | Quantity / Serial — authoritative |
| `base_unit_id` | UUID | FK | → UnitOfMeasure; this Material's single inventory base unit |
| `has_expiry` | BOOLEAN |  |  |
| `requires_asset_number` | BOOLEAN |  | derived policy projection only: true exactly for `material_kind = Asset`; not independently editable |
| `attributes` | JSONB |  | extra attributes (bridge for MaterialAttribute until v2) |
| `status` | VARCHAR(20) |  | Active / Inactive / Archived |

#### `UnitOfMeasure`
Unit of measure.

| Column | Type | Key | Description |
|---|---|---|---|
| `unit_id` | UUID | PK |  |
| `name` | VARCHAR(100) |  |  |
| `symbol` | VARCHAR(20) |  |  |
| `unit_type` | VARCHAR(50) |  |  |

#### `MaterialUnitConversion`
Per-material alternate-unit conversions to the Material's single base unit.
`UnitOfMeasure` itself has no global conversion factor.

| Column | Type | Key | Description |
|---|---|---|---|
| `conversion_id` | UUID | PK |  |
| `material_id` | UUID | FK | → Material |
| `from_unit_id` | UUID | FK | → UnitOfMeasure |
| `factor` | DECIMAL(18,6) |  | > 0; one alternate unit in Material base units |
| `status` | VARCHAR(20) |  | Active / Archived |
| `row_version` | INTEGER |  | optimistic lock |

The target unit is derived from `Material.base_unit_id`. The server rejects a
self-conversion, duplicate active `(material_id, from_unit_id)`, invalid
factor, inactive reference, unauthorized/out-of-scope request, or stale
`row_version`. A conversion used by a posted line is archived/deactivated and
replaced rather than overwritten or deleted.

### Domain: Warehouses & Inventory

#### `Warehouse`
Stock-holding unit.

| Column | Type | Key | Description |
|---|---|---|---|
| `warehouse_id` | UUID | PK |  |
| `site_id` | UUID | FK | → Site |
| `name` | VARCHAR(200) |  |  |
| `code` | VARCHAR(50) | UNIQUE |  |
| `warehouse_type` | VARCHAR(50) |  |  |
| `can_hold_stock` | BOOLEAN |  |  |
| `status` | VARCHAR(20) |  |  |
| `row_version` | INTEGER |  | optimistic lock |

#### `WarehouseCapability`
Domains a warehouse is allowed to handle.

| Column | Type | Key | Description |
|---|---|---|---|
| `capability_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse |
| `material_domain_id` | UUID | FK | → MaterialDomain |
| `status` | VARCHAR(20) |  | Active / Inactive |

#### `WarehouseCapabilityOperation`
Operations allowed per capability (replaces the old BOOLEAN columns).

| Column | Type | Key | Description |
|---|---|---|---|
| `cap_op_id` | UUID | PK |  |
| `capability_id` | UUID | FK | → WarehouseCapability |
| `operation_type` | VARCHAR(20) |  | Receiving / Issue / Transfer / Count / Return |
| | | UNIQUE | (capability_id, operation_type) |

#### `InventoryBalance`
Current balance only (cache = sum of the material movements).

| Column | Type | Key | Description |
|---|---|---|---|
| `balance_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse |
| `material_id` | UUID | FK | → Material |
| `quantity` | DECIMAL(18,3) |  | current on-hand balance |
| `last_updated` | TIMESTAMP |  |  |
| `row_version` | INTEGER |  | optimistic lock |
| | | | ⚠ ⚠ available / in_transit / damaged deferred to v2 with their processes |

#### `WarehouseMaterialSetting`
Min/max thresholds for a material in a warehouse.

| Column | Type | Key | Description |
|---|---|---|---|
| `setting_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse |
| `material_id` | UUID | FK | → Material |
| `min_quantity` | DECIMAL(18,3) |  |  |
| `max_quantity` | DECIMAL(18,3) |  |  |
| `status` | VARCHAR(20) |  |  |

#### ~~`OpeningBalance`~~ (removed — folded into WarehouseDocument)

Opening Balance is now a first-class document type. Create a `WarehouseDocument` with `document_type = Opening`, add lines via `DocumentLine` (with a new `opening_type` flag: `Initial` / `Correction`), and attach the signed copy via `DocumentAttachment`. The document follows the standard Spine lifecycle `Draft → Submitted → Posted → Reversed`. No separate table or status is needed.

**Posting behaviour (unchanged):** (a) creates a positive `Opening` `StockMovement`, (b) establishes `InventoryBalance`, (c) for asset-type materials, creates one `Asset` per unit in `DocumentLine`.

#### `StockMovement`
Immutable movement ledger (append-only).

| Column | Type | Key | Description |
|---|---|---|---|
| `movement_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse |
| `material_id` | UUID | FK | → Material |
| `document_id` | UUID | FK | → WarehouseDocument |
| `line_id` | UUID | FK | → DocumentLine — links movement to its originating line |
| `movement_type` | VARCHAR(30) |  | Receipt / Issue / TransferIn / TransferOut / AdjustmentIn / AdjustmentOut / Opening |
| `quantity_delta` | DECIMAL(18,3) |  | signed delta (+ increase / − decrease) |
| `posted_at` | TIMESTAMP |  |  |
| `posted_by` | UUID | FK | → User |
| | | | ⚠ ⚠ **UNIQUE(document_id, line_id, movement_type)** — prevents duplicate movements for the same line and type |

### Domain: Operations (Shared Header + Details)

#### `WarehouseDocument`
Shared header (Spine) for every operational document.

| Column | Type | Key | Description |
|---|---|---|---|
| `document_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse (source) |
| `created_by` | UUID | FK | → User |
| `posted_by` | UUID | FK | → User (nullable) |
| `document_type` | VARCHAR(30) |  | Receiving / Issue / Transfer / Adjustment / Opening / Return |
| `paper_document_number` | VARCHAR(100) |  | external reference (not a key) |
| `paper_document_year` | INTEGER |  |  |
| `system_reference_number` | VARCHAR(100) | UNIQUE | system-generated reference number |
| `signed_copy_attachment_id` | UUID | FK | → DocumentAttachment — required when Posted |
| `document_status` | VARCHAR(20) |  | Draft / Submitted / Posted / Reversed / Cancelled / Rejected |
| `posted_at` | TIMESTAMP |  | nullable |
| `row_version` | INTEGER |  | optimistic lock |

#### `DocumentLine`
Document lines (shared across all document types).

| Column | Type | Key | Description |
|---|---|---|---|
| `line_id` | UUID | PK |  |
| `document_id` | UUID | FK | → WarehouseDocument |
| `material_id` | UUID | FK | → Material |
| `line_type` | VARCHAR(20) |  | Normal / Asset |
| `quantity` | DECIMAL(18,3) |  | entered quantity |
| `unit_id` | UUID | FK | → UnitOfMeasure (nullable) |
| `conversion_id` | UUID | FK | nullable; selected per-material conversion snapshot |
| `conversion_factor` | DECIMAL(18,6) |  | nullable; factor snapshot when a conversion is used |
| `base_quantity` | DECIMAL(18,3) |  | in the base unit |
| `unit_price` | DECIMAL(18,2) |  | nullable |
| `batch_number` | VARCHAR(100) |  | nullable |
| `expiry_date` | DATE |  | nullable |

#### `DocumentAttachment`
Document attachments, distinguishing the signed original.

| Column | Type | Key | Description |
|---|---|---|---|
| `attachment_id` | UUID | PK |  |
| `document_id` | UUID | FK | → WarehouseDocument |
| `attachment_type` | VARCHAR(20) |  | SignedOriginal / Supporting |
| `file_path` | VARCHAR(500) |  |  |
| `original_filename` | VARCHAR(300) |  |  |
| `mime_type` | VARCHAR(100) |  |  |
| `file_size` | BIGINT |  |  |
| `checksum` | VARCHAR(128) |  |  |
| `uploaded_by` | UUID | FK | → User |
| `uploaded_at` | TIMESTAMP |  |  |

#### `ReceivingInfo`
Receiving detail (Petal — when type is Receiving).

| Column | Type | Key | Description |
|---|---|---|---|
| `document_id` | UUID | PK/FK | → WarehouseDocument (1:1) |
| `supplier_ref` | VARCHAR(200) |  | supplier name/reference (Supplier entity deferred to v2) |
| `supplier_invoice_ref` | VARCHAR(100) |  | nullable |
| `receiving_type` | VARCHAR(30) |  |  |

#### `IssueTo`
Issue detail (Petal — when type is Issue). Uses **polymorphic FK** pattern (D-POLY-01).

| Column | Type | Key | Description |
|---|---|---|---|
| `document_id` | UUID | PK/FK | → WarehouseDocument (1:1) |
| `recipient_type` | VARCHAR(20) |  | Employee / OrganizationalUnit / Site / External |
| `recipient_id` | UUID |  | recipient id (polymorphic — no DB FK constraint) |
| `issue_reason` | VARCHAR(200) |  |  |

> ⚠ **Polymorphic FK enforcement (D-POLY-01):** `recipient_id` has no database FOREIGN KEY because the target table depends on `recipient_type`. **Application-layer validation is mandatory.** Every service that writes `IssueTo` must: (1) resolve the entity table from `recipient_type`, (2) verify the row exists and has `status = Active`, (3) reject the write if validation fails. A daily housekeeping job (`audit_orphaned_polymorphic_fks`) logs orphaned references. A trigger function `trg_validate_recipient` runs on INSERT/UPDATE as a second line of defence.

#### `TransferInfo`
Transfer detail (Petal — when type is Transfer). Atomic transfer.

| Column | Type | Key | Description |
|---|---|---|---|
| `document_id` | UUID | PK/FK | → WarehouseDocument (1:1) |
| `destination_warehouse_id` | UUID | FK | → Warehouse (destination) |
| `transfer_reason` | VARCHAR(200) |  |  |
| | | | ⚠ one document + two movements (out of source, into destination) in a single transaction |

### Domain: Counts & Adjustments

#### `InventoryCount`
Inventory count operation.

| Column | Type | Key | Description |
|---|---|---|---|
| `count_id` | UUID | PK |  |
| `warehouse_id` | UUID | FK | → Warehouse |
| `created_by` | UUID | FK | → User |
| `count_type` | VARCHAR(30) |  |  |
| `scope_type` | VARCHAR(30) |  |  |
| `freeze_policy` | VARCHAR(20) |  | HardFreeze / SoftFreeze / NoFreeze |
| `status` | VARCHAR(20) |  | Planned / InProgress / Completed / Closed |
| `started_at` | TIMESTAMP |  |  |
| `closed_at` | TIMESTAMP |  | nullable |
| `row_version` | INTEGER |  |  |

#### `InventoryCountLine`
Count line.

| Column | Type | Key | Description |
|---|---|---|---|
| `count_line_id` | UUID | PK |  |
| `count_id` | UUID | FK | → InventoryCount |
| `material_id` | UUID | FK | → Material |
| `asset_id` | UUID | FK | → Asset (nullable) |
| `snapshot_quantity` | DECIMAL(18,3) |  |  |
| `actual_quantity` | DECIMAL(18,3) |  |  |
| `difference` | DECIMAL(18,3) |  |  |
| `reason` | VARCHAR(200) |  |  |

#### `InventoryAdjustment`
Adjustment (posted via a document).

| Column | Type | Key | Description |
|---|---|---|---|
| `adjustment_id` | UUID | PK |  |
| `count_id` | UUID | FK | → InventoryCount (nullable) |
| `document_id` | UUID | FK | → WarehouseDocument |
| `status` | VARCHAR(20) |  | Draft / Posted / Reversed |
| `reason` | TEXT |  |  |

#### `AdjustmentLine`
Adjustment line.

| Column | Type | Key | Description |
|---|---|---|---|
| `adj_line_id` | UUID | PK |  |
| `adjustment_id` | UUID | FK | → InventoryAdjustment |
| `material_id` | UUID | FK | → Material |
| `difference` | DECIMAL(18,3) |  | +/− |
| `reason` | VARCHAR(200) |  |  |

### Domain: Assets & Custody

#### `Asset`
A single asset instance. No custody pointer (derived from the open row). **`status` is a derived field** (D-AST-02) — computed from `Custody` and `AssetMovementHistory` via a database view.

| Column | Type | Key | Description |
|---|---|---|---|
| `asset_id` | UUID | PK |  |
| `material_id` | UUID | FK | → Material |
| `warehouse_id` | UUID | FK | → Warehouse (nullable) |
| `receipt_line_id` | UUID | FK | → DocumentLine (nullable) |
| `asset_number` | VARCHAR(100) | UNIQUE, NOT NULL | required EIAMS internal number, unique enterprise-wide; only for Asset records |
| `serial_number` | VARCHAR(200) |  | optional manufacturer serial; distinct from asset_number |
| `acquisition_date` | DATE |  |  |
| `warranty_expiry` | DATE |  | nullable |
| `row_version` | INTEGER |  |  |

**Derived status logic** (implemented as view `v_asset_current_status`):
- `InStock`: no active custody row exists, and the latest movement is `Received` or `Returned`
- `Issued`: an active custody row exists with `custody_kind = Operational` (pending personal assignment)
- `InCustody`: an active custody row exists with `custody_kind = Personal`
- `Disposed`: the latest `AssetMovementHistory.movement_type = Disposed`

A materialised or scheduled refresh is not needed — the view is lightweight and queried on demand.

#### `AssetMovementHistory`
Asset movement history.

| Column | Type | Key | Description |
|---|---|---|---|
| `movement_id` | UUID | PK |  |
| `asset_id` | UUID | FK | → Asset |
| `document_id` | UUID | FK | → WarehouseDocument |
| `movement_type` | VARCHAR(30) |  | Received / Transferred / Issued / Returned |
| `moved_at` | TIMESTAMP |  |  |

#### `Custody`
Historical physical **Asset** responsibility timeline. One active row per
asset. It uses the **polymorphic FK** pattern (D-POLY-01). D-MAT-01's
provisional OpenAPI extends the read/mutation model with Durable
`MaterialQuantity` and `TrackedUnit` responsibility and partial returns;
backend ratification remains required before production integration.

| Column | Type | Key | Description |
|---|---|---|---|
| `custody_id` | UUID | PK |  |
| `asset_id` | UUID | FK | → Asset |
| `holder_type` | VARCHAR(20) |  | Employee / OrganizationalUnit / Site / External |
| `holder_id` | UUID |  | holder id (polymorphic — no DB FK constraint) |
| `custody_kind` | VARCHAR(20) |  | Operational / Personal |
| `issue_document_id` | UUID | FK | → WarehouseDocument |
| `return_document_id` | UUID | FK | → WarehouseDocument (nullable) |
| `status` | VARCHAR(20) |  | Active / Closed |
| `from_ts` | TIMESTAMP |  |  |
| `to_ts` | TIMESTAMP |  | nullable |
| `row_version` | INTEGER |  |  |

> ⚠ **Polymorphic FK enforcement (D-POLY-01):** Same pattern as `IssueTo`. `holder_id` has no DB FK; application-layer validation must verify the referenced entity is active. A trigger function `trg_validate_custody_holder` runs on INSERT/UPDATE. The daily `audit_orphaned_polymorphic_fks` housekeeping job covers both tables.

#### `CustodyHistory`
Log of custody state changes.

| Column | Type | Key | Description |
|---|---|---|---|
| `history_id` | UUID | PK |  |
| `custody_id` | UUID | FK | → Custody |
| `from_status` | VARCHAR(20) |  |  |
| `to_status` | VARCHAR(20) |  |  |
| `changed_by` | UUID | FK | → User |
| `at_ts` | TIMESTAMP |  |  |
| `note` | VARCHAR(300) |  |  |

### Domain: Audit & Numbering

#### `AuditLog`
Audit log header (one row per operation). Carries an optional JSONB summary for quick context; the per-field detail lives in `AuditLogEntry`.

| Column | Type | Key | Description |
|---|---|---|---|
| `log_id` | UUID | PK |  |
| `user_id` | UUID | FK | → User |
| `entity_type` | VARCHAR(100) |  | entity name (e.g., WarehouseDocument, Asset) |
| `entity_id` | UUID |  | id of the affected entity |
| `action` | VARCHAR(50) |  | Create / Update / Delete / Approve / Post / Cancel / Reverse |
| `summary` | JSONB | nullable | optional full-snapshot diff for quick rendering |
| `ip_address` | VARCHAR(45) |  |  |
| `created_at` | TIMESTAMP |  |  |

#### `AuditLogEntry`
Per-field audit trail (one row per changed field). Enables indexed search on individual fields.

| Column | Type | Key | Description |
|---|---|---|---|
| `entry_id` | UUID | PK |  |
| `log_id` | UUID | FK | → AuditLog |
| `field_name` | VARCHAR(100) |  | name of the changed field |
| `old_value` | TEXT | nullable | previous value (text-serialised) |
| `new_value` | TEXT | nullable | new value (text-serialised) |

**Query patterns:**
- "Who changed the price of material X?" → `SELECT * FROM AuditLogEntry WHERE field_name = 'unit_price' AND ...`
- "Full diff for document Y" → `SELECT * FROM AuditLogEntry WHERE log_id IN (SELECT log_id FROM AuditLog WHERE entity_id = 'Y') ORDER BY e.entry_id`
- "Recent activity by user Z" → `SELECT * FROM AuditLog WHERE user_id = 'Z' ORDER BY created_at DESC`

#### `DocumentSequence`
System reference-number generator (scope key: site).

| Column | Type | Key | Description |
|---|---|---|---|
| `sequence_id` | UUID | PK |  |
| `site_id` | UUID | FK | → Site |
| `document_type` | VARCHAR(30) |  |  |
| `year` | INTEGER |  |  |
| `last_sequence` | INTEGER |  | last number issued |
| | | | ⚠ Logical key: (site_id, document_type, year) — annual reset, via DB sequence |

### 10.3 Relationships

```
erDiagram
  Organization ||--o{ Site : contains
  Site ||--o{ Warehouse : hosts
  Site ||--o{ OrganizationalUnit : contains
  OrganizationalUnit ||--o{ OrganizationalUnit : "parent of"
  OrganizationalUnit ||--o{ Employee : employs
  Employee ||--o| User : "linked to"
  User ||--o{ UserRoleScope : has
  Role ||--o{ UserRoleScope : "assigned to"
  Role ||--o{ RolePermission : grants
  Permission ||--o{ RolePermission : "granted in"
  MaterialDomain ||--o{ MaterialCategory : classifies
  MaterialCategory ||--o{ MaterialCategory : "parent of"
  MaterialCategory ||--o{ MaterialFamily : groups
  MaterialFamily ||--o{ Material : templates
  Material ||--o{ MaterialUnitConversion : converts
  UnitOfMeasure ||--o{ MaterialUnitConversion : from
  UnitOfMeasure ||--o{ Material : "base unit"
  Warehouse ||--o{ WarehouseCapability : has
  WarehouseCapability ||--o{ WarehouseCapabilityOperation : permits
  MaterialDomain ||--o{ WarehouseCapability : enables
  Site ||--o{ DocumentSequence : "sequences for"
  Warehouse ||--o{ InventoryBalance : tracks
  Material ||--o{ InventoryBalance : "balanced in"
  Warehouse ||--o{ WarehouseMaterialSetting : configures
  Material ||--o{ WarehouseMaterialSetting : "configured in"
  WarehouseDocument ||--o{ StockMovement : generates
  Warehouse ||--o{ StockMovement : "moved in"
  Material ||--o{ StockMovement : moved
  Warehouse ||--o{ WarehouseDocument : processes
  User ||--o{ WarehouseDocument : creates
  WarehouseDocument ||--o{ DocumentLine : contains
  Material ||--o{ DocumentLine : "referenced in"
  WarehouseDocument ||--o{ DocumentAttachment : has
  WarehouseDocument ||--o| DocumentAttachment : "signed copy"
  WarehouseDocument ||--o| ReceivingInfo : "if Receiving"
  WarehouseDocument ||--o| IssueTo : "if Issue"
  WarehouseDocument ||--o| TransferInfo : "if Transfer"
  Warehouse ||--o{ TransferInfo : destination
  Warehouse ||--o{ InventoryCount : counted
  InventoryCount ||--o{ InventoryCountLine : counts
  Material ||--o{ InventoryCountLine : counted
  Asset ||--o{ InventoryCountLine : "asset counted"
  InventoryCount ||--o| InventoryAdjustment : triggers
  WarehouseDocument ||--o{ InventoryAdjustment : "posts via"
  InventoryAdjustment ||--o{ AdjustmentLine : adjusts
  Material ||--o{ AdjustmentLine : adjusted
  Material ||--o{ Asset : "type of"
  Warehouse ||--o{ Asset : stores
  DocumentLine ||--o{ Asset : "received as"
  Asset ||--o{ AssetMovementHistory : moved
  Asset ||--o{ Custody : "responsibility timeline"
  WarehouseDocument ||--o{ Custody : "issued by"
  WarehouseDocument ||--o{ Custody : "returned by"
  Custody ||--o{ CustodyHistory : records
  User ||--o{ AuditLog : generates
  AuditLog ||--o{ AuditLogEntry : details
```

### 10.4 Enumerations

Every value below is constrained via `CHECK` or a reference table — no free-text.

| Field | Allowed values |
|---|---|---|
| `WarehouseDocument.document_status` | Draft | Submitted | Posted | Reversed | Cancelled | Rejected |
| `WarehouseDocument.document_type` | Receiving | Issue | Transfer | Adjustment | Opening | Return |
| `Custody.status` | Active | Closed |
| `Custody.holder_type` | Employee | OrganizationalUnit | Site | External |
| `Custody.custody_kind` | Operational | Personal |
| `StockMovement.movement_type` | Receipt | Issue | TransferIn | TransferOut | AdjustmentIn | AdjustmentOut | Opening |
| `InventoryCount.status` | Planned | InProgress | Completed | Closed |
| `InventoryCount.freeze_policy` | HardFreeze | SoftFreeze | NoFreeze |
| `InventoryAdjustment.status` | Draft | Posted | Reversed |
| `Material.material_kind` | Consumable | Durable | Asset |
| `Material.tracking_type` | Quantity | Serial |
| `Material` policy | Consumable = Quantity/no asset number/no custody; Durable = Quantity or Serial/no asset number/custody required; Asset = Serial/asset number/custody required |
| `IssueTo.recipient_type` | Employee | OrganizationalUnit | Site | External |
| `DocumentAttachment.attachment_type` | SignedOriginal | Supporting |
| `UserRoleScope.scope_type` | Enterprise | Site | Warehouse |
| `WarehouseCapabilityOperation.operation_type` | Receiving | Issue | Transfer | Count | Return |

### 10.5 Constraints

These invariants are enforced by database constraints, not application code:

| Constraint | Expression |
|---|---|---|
| One active custody per asset | `UNIQUE(asset_id) WHERE status = 'Active'` (partial) |
| Material policy | enforce the D-MAT-01 kind/tracking/asset-number matrix on catalog writes and document posting; prevent change after first posted movement |
| Material unit conversion | Material owns one non-null base unit; `factor > 0`; prohibit base-unit self conversion and duplicate active `(material_id, from_unit_id)`; preserve `conversion_id`, factor, and base quantity on posted DocumentLine; archive/deactivate used conversions rather than delete or overwrite |
| One balance per material per warehouse | `UNIQUE(warehouse_id, material_id)` |
| Unique identifiers | `UNIQUE`: asset_number, Material.code, Site.code, Warehouse.code, employee_number, system_reference_number |
| Non-negative & valid time ranges | `CHECK(quantity >= 0)` · `CHECK(from_ts < to_ts)` on Custody |
| Signed-copy rule | `document_status = 'Posted' ⇒ an attachment with attachment_type = 'SignedOriginal' exists` |
| Standard audit columns | `created_at, created_by, updated_at, updated_by` on every master & operational entity |
| Document numbering | database sequence per `(site_id, document_type, year)`, annual reset |
| Balance / ledger consistency | `InventoryBalance.quantity` is a cache = sum of `StockMovement.quantity_delta`; updated after row-locking the balance within the posting transaction |
| StockMovement uniqueness | `UNIQUE(document_id, line_id, movement_type)` — prevents duplicate movements for the same document line |
| Asset status derived | No `Asset.status` column; status is computed via view `v_asset_current_status` from `Custody` and `AssetMovementHistory` |
| Polymorphic FK guard (IssueTo) | `CHECK(recipient_id IS NOT NULL)` when document is Posted; application-layer validation enforces existence in the target entity table |
| Polymorphic FK guard (Custody) | `CHECK(holder_id IS NOT NULL)` when `status = 'Active'`; application-layer validation enforces existence in the target entity table |
| Capability operation uniqueness | `UNIQUE(capability_id, operation_type)` on `WarehouseCapabilityOperation` |

### 10.6 Deferred to v2 (adding these later does not break existing tables)

- `StorageLocation` — storage bins within a warehouse
- `MaterialAttribute` — structured attributes (temporarily covered by `Material.attributes JSONB`)
- `Supplier` — supplier entity (v1 uses `ReceivingInfo.supplier_ref` as text)
- `Notification` — notifications
- `TransferRequest` / `TransferRequestLine` — two-phase transfer (ship-then-receive) with in-transit balance
- `Reserved` / `Available` / `In-Transit` / `Damaged` balances (split from `InventoryBalance`)
- Maintenance module and its related asset states


---

## Chapter 11 — Out of Scope & Deferred

Out of scope for the first release: the maintenance module, notifications, detailed storage locations, the supplier entity, structured material attributes, two-phase transfer, Reserved/Available/Damaged balances, multilingual asset data, and advanced reporting. Deferred-table details are in section 10.6; the system is designed so that adding them later does not break existing tables.

---

## Chapter 12 — Detailed Process Flows

> This chapter provides step-by-step operational flows for every document type, mirroring the real work procedures at the Authority. Each flow specifies the task, description, and responsible role per the RBAC model in Chapter 5. All flows follow the unified document lifecycle: `Draft → Submitted → Posted → Reversed` (with `Rejected → Draft` and `Cancelled` before posting only).

### 12.1 Common preconditions for all operational documents

| # | Rule |
|---|---|
| 1 | The user must hold a role with the required permission for the operation, within the scope of the target warehouse. |
| 2 | The warehouse must hold a `WarehouseCapability` that allows the operation for the material's domain. |
| 3 | The material must exist in the central catalog and have `status = Active`. |
| 4 | The signed paper copy must be uploaded (`attachment_type = SignedOriginal`) before the document can be posted. |
| 5 | No operation may be performed on a `Posted` or `Reversed` document — only `Draft` documents are editable. |

### 12.2 Receiving flow

| Step | Description | Responsible |
|---|---|---|
| 1. Create document | Create a new `WarehouseDocument` with `document_type = Receiving`; select the target warehouse and receiving type (Supplier / Transfer / Return). | Warehouse Keeper |
| 2. Add lines | Enter material lines: material, quantity, unit, unit price (optional), batch number (optional), expiry date (optional). For asset-type materials, set `line_type = Asset`. | Warehouse Keeper |
| 3. Enter supplier details | Fill in `ReceivingInfo`: supplier name/reference, supplier invoice reference (optional). | Warehouse Keeper |
| 4. Upload signed copy | Upload the scanned signed paper document (`attachment_type = SignedOriginal`). Additional supporting attachments may be added (`attachment_type = Supporting`). | Warehouse Keeper |
| 5. Submit for posting | Submit the document → status becomes `Submitted`. The document is now locked for editing. | Warehouse Keeper |
| 6. Post document | Review and post the document. The system: (a) creates a positive `Receipt` `StockMovement` per line, (b) updates `InventoryBalance`, (c) creates one `Asset` record per unit for asset-type lines, (d) records the `AuditLog` entry. | Warehouse Manager |
| 7. Notification | System records the completed operation. No external notification in v1. | System |

**Business rules:**
- The receiving warehouse must have a `WarehouseCapability` with a `WarehouseCapabilityOperation` row for `operation_type = Receiving` for the material's domain.
- Only `material_kind = Asset` is entered with `line_type = Asset`; a serial-tracked Durable remains a Durable and never creates an Asset record.
- A single document may mix consumable materials and asset-type materials.

### 12.3 Issue flow

| Step | Description | Responsible |
|---|---|---|
| 1. Create document | Create a new `WarehouseDocument` with `document_type = Issue`; select the source warehouse. | Warehouse Keeper |
| 2. Define recipient | Fill in `IssueTo`: recipient type (Employee / OrganizationalUnit / Site / External) and recipient ID, plus issue reason. | Warehouse Keeper |
| 3. Add lines | Enter material lines: material, quantity, unit. For asset-type materials, set `line_type = Asset` and select the specific asset serial/ID. | Warehouse Keeper |
| 4. Upload signed copy | Upload the scanned signed paper document (`attachment_type = SignedOriginal`). | Warehouse Keeper |
| 5. Submit for posting | Submit the document → status becomes `Submitted`. The document is now locked for editing. | Warehouse Keeper |
| 6. Post document | Review and post the document. The system: (a) verifies sufficient balance for each material, (b) creates a negative `Issue` `StockMovement` per line, (c) updates `InventoryBalance`, (d) opens Asset custody for Asset lines and, once D-MAT-01's contract is published, Durable custody for Durable lines, (e) records the `AuditLog` entry. Consumable lines create no custody. Asset status (`Issued`) is derived via `v_asset_current_status`. | Warehouse Manager |
| 7. Notification | System records the completed operation. | System |

**Business rules:**
- Issued quantity must not exceed the available balance (per the negative-stock policy).
- Issuing to an `Employee` automatically sets `custody_kind = Personal`; issuing to an `OrganizationalUnit` or `Site` sets `custody_kind = Operational` (pending personal assignment).
- A single document may mix consumable materials and asset-type materials.

### 12.4 Transfer flow (atomic)

| Step | Description | Responsible |
|---|---|---|
| 1. Create document | Create a new `WarehouseDocument` with `document_type = Transfer`; select the source warehouse. | Warehouse Keeper |
| 2. Define destination | Fill in `TransferInfo`: destination warehouse and transfer reason. | Warehouse Keeper |
| 3. Add lines | Enter material lines: material, quantity, unit. Only consumable/durable materials (non-asset) in v1. | Warehouse Keeper |
| 4. Upload signed copy | Upload the scanned signed paper document (`attachment_type = SignedOriginal`). | Warehouse Keeper |
| 5. Submit for posting | Submit the document → status becomes `Submitted`. The document is now locked for editing. | Warehouse Keeper |
| 6. Post document | Review and post the document. The system, **in a single transaction**: (a) verifies sufficient balance in the source warehouse, (b) creates a negative `TransferOut` movement for the source, (c) creates a positive `TransferIn` movement for the destination, (d) updates both warehouses' `InventoryBalance`, (e) records the `AuditLog` entry. | Warehouse Manager |

**Business rules:**
- Transfers are atomic — both source deduction and destination addition occur in one database transaction.
- Cross-governorate transfers are blocked by the transfer policy (configurable business rule, enforced at the application layer).
- Transfer of asset-type materials is deferred to v2 (asset transfers currently go through Issue + Receiving).

### 12.5 Opening Balance flow

Opening Balance uses the standard Spine lifecycle (`Draft → Submitted → Posted → Reversed`). Create a `WarehouseDocument` with `document_type = Opening` (D-OPEN-01).

| Step | Description | Responsible |
|---|---|---|
| 1. Create document | Create a new `WarehouseDocument` with `document_type = Opening`; select the target warehouse. | Warehouse Keeper |
| 2. Add lines | Add `DocumentLine` entries: material, quantity (as opening balance), and set `opening_type = Initial`. | Warehouse Keeper |
| 3. Upload signed copy | Upload the scanned signed document authorising the opening balance (`attachment_type = SignedOriginal`). | Warehouse Keeper |
| 4. Submit for posting | Submit the document → status becomes `Submitted`. | Warehouse Keeper |
| 5. Post | Review and post the document. The system: (a) creates a positive `Opening` `StockMovement` per line, (b) establishes `InventoryBalance`, (c) creates `Asset` records for asset-type materials, (d) records the `AuditLog` entry. | Warehouse Manager |

**Business rules:**
- Opening Balance is a one-time initialisation operation — not a routine document type.
- Posted opening balances can be reversed via a standard reversal document if needed (status → `Reversed`), or corrected via an `Adjustment` document.
- For asset-type materials, one `Asset` record is created per unit in the `DocumentLine` (linked via `receipt_line_id`).

### 12.6 Inventory Count flow

| Step | Description | Responsible |
|---|---|---|
| 1. Plan count | Create an `InventoryCount` session: select warehouse, count type, scope, and freeze policy (`SoftFreeze` recommended for v1). Status → `Planned`. | Warehouse Manager |
| 2. Snapshot balances | The system captures current `InventoryBalance` quantities into `InventoryCountLine.snapshot_quantity`. | System |
| 3. Start count | Begin the count session. Status → `InProgress`. SoftFreeze warnings are shown to other users. | Warehouse Manager |
| 4. Enter actual quantities | Count team enters `actual_quantity` for each count line. The system computes `difference = actual_quantity − snapshot_quantity`. | Warehouse Keeper |
| 5. Complete count | Mark the count session as complete. Status → `Completed`. | Warehouse Manager |
| 6. Review & approve | Review differences, add reasons for each variance. Status → `Closed`. | Warehouse Manager |
| 7. Create adjustment | For material with non-zero differences, create an `InventoryAdjustment` document referencing the count session. Follow the adjustment flow (12.7). | Warehouse Manager |

**Business rules:**
- A count session cannot be started if another session for the same warehouse is `InProgress`.
- `SoftFreeze` displays warnings but does not block operations. `HardFreeze` blocks posting within the warehouse (available as a policy option). `NoFreeze` disables all freeze behaviour.
- Balance is never modified directly by the count — adjustments are the only mechanism.

### 12.7 Adjustment flow

| Step | Description | Responsible |
|---|---|---|
| 1. Create adjustment | Create a `WarehouseDocument` with `document_type = Adjustment` and an `InventoryAdjustment` record. Link to the originating `InventoryCount` session if applicable. | Warehouse Manager |
| 2. Add adjustment lines | Enter `AdjustmentLine`s: material, difference (+/−), reason. | Warehouse Manager |
| 3. Upload signed copy | Upload the scanned signed document authorising the adjustment. | Warehouse Manager |
| 4. Post adjustment | Post the document. The system: (a) creates `AdjustmentIn` (positive delta) or `AdjustmentOut` (negative delta) `StockMovement`s, (b) updates `InventoryBalance`, (c) records the `AuditLog` entry. | Warehouse Manager |
| 5. Reverse (if needed) | If a posted adjustment is found to be erroneous, create a reversing adjustment document rather than deleting the original. Status → `Reversed`. | Warehouse Manager |

**Business rules:**
- No direct modification of `InventoryBalance` is allowed from any screen.
- Every adjustment must have a documented reason.
- Adjustments not arising from a count session (e.g., correction of a data-entry error) must include an explicit justification.

### 12.8 Custody assignment flow (post-Issue)

This flow applies after an asset has been issued to a party and is in `Operational` custody (pending personal assignment).

| Step | Description | Responsible |
|---|---|---|
| 1. Identify pending assets | View list of assets with `Custody.custody_kind = Operational` and `Custody.status = Active` (i.e., pending custody). | Warehouse Keeper / Manager |
| 2. Assign to employee | Create a new `Custody` row for the asset with `holder_type = Employee`, `custody_kind = Personal`, linked to the original issue document. Close the previous Operational custody row (`status = Closed`, `to_ts = now`). | Warehouse Keeper |
| 3. Employee acknowledgment | Employee acknowledges receipt (outside the system in v1; the signed paper document serves as proof). | Employee |
| 4. Custody confirmed | The custody row is active (`status = Active`, `from_ts = now`). The asset's current status (`InCustody`) is derived via `v_asset_current_status`. | System |

**Business rules:**
- An asset may transition directly from `InStock` to `Personal` custody if issued directly to an employee.
- An asset may remain in `Operational` custody indefinitely if no personal assignment is made.
- The custody timeline is fully preserved via `CustodyHistory`.

### 12.9 Return flow

| Step | Description | Responsible |
|---|---|---|
| 1. Create return document | Create a `WarehouseDocument` with `document_type = Return`. | Warehouse Keeper |
| 2. Select asset/material | Select the asset or material being returned, and the originating issue document. | Warehouse Keeper |
| 3. Upload signed copy | Upload the scanned signed return document. | Warehouse Keeper |
| 4. Submit for posting | Submit the document → status becomes `Submitted`. | Warehouse Keeper |
| 5. Post return | Review and post the document. The system: (a) creates a positive `Receipt` movement for consumable materials, (b) updates `InventoryBalance`, (c) closes the active custody row (`status = Closed`, `to_ts = now`), (d) records the `AuditLog` entry. The asset's current status (`InStock`) is derived via `v_asset_current_status`. | Warehouse Manager |

**Business rules:**
- A return always references the original issue document for traceability.
- Physical condition verification is handled outside the system in v1.

### 12.10 Disposal flow

| Step | Description | Responsible |
|---|---|---|
| 1. Create disposal document | Create a `WarehouseDocument` with `document_type = Adjustment` referencing the asset, with reason = "Disposal". | Warehouse Keeper |
| 2. Select asset | Select the specific asset to be disposed of. | Warehouse Keeper |
| 3. Upload signed copy | Upload the scanned signed disposal authorisation. | Warehouse Keeper |
| 4. Submit for posting | Submit the document → status becomes `Submitted`. | Warehouse Keeper |
| 5. Post disposal | Review and post the document. The system: (a) closes the active custody row (`status = Closed`, `to_ts = now`), (b) records the `AuditLog` entry. The asset's current status (`Disposed`) is derived via `v_asset_current_status`. | Warehouse Manager |

**Business rules:**
- `Disposed` is a terminal state — no further operations on the asset are allowed.
- The asset record is never deleted; full history is preserved.

---

*End of document.*
