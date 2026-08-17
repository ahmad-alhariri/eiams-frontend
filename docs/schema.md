# EIAMS — Database Schema v5.0

## Overview

PostgreSQL 16 — 38 tables in v1, 4 deferred to v2+

### Design Principles
- **UUID PKs** everywhere (`gen_random_uuid()`) — not sequential, safe from enumeration
- **Timestamps** (`created_at TIMESTAMP DEFAULT NOW()`) on every table
- **Row version** (`row_version INTEGER`) for optimistic concurrency
- **Append-only** for audit-critical tables (StockMovement, AuditLog, CustodyHistory, AssetMovementHistory)
- **Soft delete** for reference data (User, Material, Warehouse) — status field, never hard DELETE

---

## Domain Map

```
Organization  │ Security  │ Catalog  │ Warehouse  │ Inventory  │ Operations
(4)             (5)        (6)        (4)          (3)          (7)

Asset  │  Custody  │  Count & Adj  │  Supporting
(2)      (2)         (4)             (2)
```

---

## 1. Organization Domain (4 tables)

### Organization
The legal entity that owns the system — the Authority itself. Single instance.

| Column | Type | Notes |
|--------|------|-------|
| organization_id | UUID PK | |
| name | VARCHAR(200) | |
| code | VARCHAR(20) UNIQUE | |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `1:N → Site`

### Site
An operational or geographical location — Main HQ, Damascus Branch, Aleppo Branch.

| Column | Type | Notes |
|--------|------|-------|
| site_id | UUID PK | |
| organization_id | UUID FK | → Organization |
| name | VARCHAR(200) | |
| code | VARCHAR(20) UNIQUE | |
| address | TEXT | |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `N:1 ← Organization`, `1:N → Warehouse`, `1:N → OrganizationalUnit`

### OrganizationalUnit
Any level in the organizational hierarchy — Directorate, Department, Section, Division. Self-referencing for unlimited depth.

| Column | Type | Notes |
|--------|------|-------|
| org_unit_id | UUID PK | |
| site_id | UUID FK | → Site |
| parent_org_unit_id | UUID FK nullable | → self |
| name | VARCHAR(200) | |
| unit_type | VARCHAR(30) | Directorate / Department / Section / Division |
| code | VARCHAR(20) | |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `N:1 ← Site`, `*:1 ← self (parent)`, `1:N → Employee`

### Employee
A person employed by the authority. May or may not have a User account.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID PK | |
| org_unit_id | UUID FK | → OrganizationalUnit |
| employee_number | VARCHAR(50) UNIQUE | Staff ID |
| full_name | VARCHAR(200) | |
| job_title | VARCHAR(200) | |
| email | VARCHAR(200) | |
| phone | VARCHAR(30) | |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `N:1 ← OrganizationalUnit`, `1:1? → User`

---

## 2. Security Domain (5 tables)

### User
A system account for logging into EIAMS.

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID PK | |
| employee_id | UUID FK nullable | → Employee |
| username | VARCHAR(100) UNIQUE | |
| password_hash | VARCHAR(500) | bcrypt/Argon2 |
| status | VARCHAR(20) | Pending / Active / Suspended / Disabled |
| last_login | TIMESTAMP | |

**Relationships:** `1:1? ← Employee`, `1:N → UserRoleScope`, `1:N → WarehouseDocument`, `1:N → AuditLog`

### Role
A named role with a set of permissions.

| Column | Type | Notes |
|--------|------|-------|
| role_id | UUID PK | |
| name | VARCHAR(100) UNIQUE | |
| description | TEXT | |

**Relationships:** `1:N → UserRoleScope`, `1:N → RolePermission`

### Permission
An atomic permission action (e.g., `document.create`, `document.post`, `balance.view`).

| Column | Type | Notes |
|--------|------|-------|
| permission_id | UUID PK | |
| code | VARCHAR(100) UNIQUE | e.g., `document.approve` |
| description | TEXT | |

**Relationships:** `1:N → RolePermission`

### UserRoleScope
Links a User to a Role within a Scope (Enterprise / Site / Warehouse). A user can have multiple roles at different scopes.

| Column | Type | Notes |
|--------|------|-------|
| user_role_scope_id | UUID PK | |
| user_id | UUID FK | → User |
| role_id | UUID FK | → Role |
| scope_type | VARCHAR(30) | Enterprise / Site / Warehouse |
| scope_id | UUID | polymorphic — ID of the scope entity |
| effective_from | TIMESTAMP | |

### RolePermission
Grants a Permission to a Role.

| Column | Type | Notes |
|--------|------|-------|
| role_permission_id | UUID PK | |
| role_id | UUID FK | → Role |
| permission_id | UUID FK | → Permission |

---

## 3. Catalog Domain (6 tables)

### MaterialDomain
Top-level classification — e.g., "Office Supplies", "IT Equipment", "Furniture".

| Column | Type | Notes |
|--------|------|-------|
| domain_id | UUID PK | |
| name | VARCHAR(200) | |
| code | VARCHAR(20) UNIQUE | |
| description | TEXT | |

**Relationships:** `1:N → MaterialCategory`

### MaterialCategory
Second-level classification. Self-referencing for sub-categories.

| Column | Type | Notes |
|--------|------|-------|
| category_id | UUID PK | |
| domain_id | UUID FK | → MaterialDomain |
| parent_category_id | UUID FK nullable | → self |
| name | VARCHAR(200) | |
| code | VARCHAR(20) UNIQUE | |

**Relationships:** `N:1 ← MaterialDomain`, `*:1 ← self (parent)`, `1:N → MaterialFamily`

### MaterialFamily
Groups similar materials — e.g., "A4 Paper", "Desk Chairs", "Laptops".

| Column | Type | Notes |
|--------|------|-------|
| family_id | UUID PK | |
| category_id | UUID FK | → MaterialCategory |
| name | VARCHAR(200) | |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `N:1 ← MaterialCategory`, `1:N → Material`

### Material
A specific catalogued item. D-MAT-01 is authoritative over this historical
table sketch: `Consumable` is Quantity-only/no asset number/no custody;
`Durable` is Quantity or Serial/no asset number/mandatory custody; `Asset` is
Serial-only/required internal asset number/mandatory custody and registry.

| Column | Type | Notes |
|--------|------|-------|
| material_id | UUID PK | |
| family_id | UUID FK nullable | → MaterialFamily |
| name | VARCHAR(300) | |
| code | VARCHAR(50) UNIQUE | |
| material_kind | VARCHAR(20) | Consumable / Durable / Asset |
| tracking_type | VARCHAR(20) | Quantity / Serial; constrained by D-MAT-01 |
| base_unit_id | UUID FK | → UnitOfMeasure; this Material's single inventory base unit |
| requires_asset_number | BOOLEAN | derived only; true exactly for Asset |
| attributes | JSONB | Extra attributes (flexible, replaces MaterialAttribute in v2) |
| status | VARCHAR(20) | Active / Archived |

**Note:** `family_id` is nullable because the catalog hierarchy is not always fully defined at system startup. Material domain is derived via chain: Material → Family → Category → Domain — not stored directly.

**Relationships:** `N:1 ← MaterialFamily`, `1:N → InventoryBalance`, `1:N → DocumentLine`, `1:N → Asset`, `1:N → StockMovement`

### UnitOfMeasure
Reusable measurement-unit vocabulary. Unit names do not carry a global
packaging quantity; a MaterialUnitConversion is the material-specific meaning.

| Column | Type | Notes |
|--------|------|-------|
| unit_id | UUID PK | |
| name | VARCHAR(100) | e.g., "Piece", "Kilogram", "Box" |
| abbreviation | VARCHAR(20) | |
| category | VARCHAR(30) | Count / Weight / Volume / Length |

**Relationships:** `1:N → Material (base_unit)`, `1:N → MaterialUnitConversion`

### MaterialUnitConversion
An alternate-unit relationship for one Material, directly to that Material's
base unit. For example, one Carton can be 12 Pieces of pens and six Boxes of
printer ink without creating a global Carton conversion.

| Column | Type | Notes |
|--------|------|-------|
| conversion_id | UUID PK | |
| material_id | UUID FK | → Material; required |
| from_unit_id | UUID FK | → UnitOfMeasure |
| factor | DECIMAL(18,6) | > 0; base units in one alternate unit |
| status | VARCHAR(20) | Active / Archived |
| row_version | INTEGER | Optimistic concurrency |

The target base unit is derived from `Material.base_unit_id`. A base-unit
self-conversion and a duplicate active `(material_id, from_unit_id)` are
prohibited. A conversion used by a posted document is archived/deactivated and
replaced rather than deleted or overwritten.

---

## 4. Warehouse Domain (3 tables)

### Warehouse
A physical or logical storage location within a Site.

| Column | Type | Notes |
|--------|------|-------|
| warehouse_id | UUID PK | |
| site_id | UUID FK | → Site |
| name | VARCHAR(200) | |
| code | VARCHAR(20) UNIQUE | |
| type | VARCHAR(30) | Main / Secondary / Archive |
| status | VARCHAR(20) | Active / Inactive |

**Relationships:** `N:1 ← Site`, `1:N → InventoryBalance`, `1:N → WarehouseDocument`, `1:N → InventoryCount`

### WarehouseCapability
Which material domains a warehouse can handle. Limits what can be stored.

| Column | Type | Notes |
|--------|------|-------|
| capability_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| domain_id | UUID FK | → MaterialDomain |
| status | VARCHAR(20) | Active / Inactive |

### WarehouseCapabilityOperation *(new in v5 — replaces BOOLEAN columns)*
Which operations are allowed per capability. Replaces `allow_receiving`, `allow_issue`, `allow_transfer`, `allow_count` BOOLEAN columns (D-CAP-01).

| Column | Type | Notes |
|--------|------|-------|
| cap_op_id | UUID PK | |
| capability_id | UUID FK | → WarehouseCapability |
| operation_type | VARCHAR(20) | Receiving / Issue / Transfer / Count / Return |

**UNIQUE** on (capability_id, operation_type)

### DocumentSequence
Auto-increment numbering per year + warehouse + document type.

| Column | Type | Notes |
|--------|------|-------|
| sequence_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| document_type | VARCHAR(30) | Receiving / Issue / Transfer / Adjustment |
| year | INT | |
| last_number | INT | Last used number |

---

## 5. Inventory Domain (3 tables)

### InventoryBalance
Current stock quantity per warehouse + material. The single source of truth for what's in stock.

| Column | Type | Notes |
|--------|------|-------|
| balance_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| material_id | UUID FK | → Material |
| quantity | DECIMAL(18,3) | Current on-hand quantity |
| row_version | INTEGER | Optimistic concurrency |

**UNIQUE** on (warehouse_id, material_id)

**Key rule:** Updated ONLY through StockMovement. Read with `SELECT ... FOR UPDATE` inside a transaction to prevent race conditions.

### WarehouseMaterialSetting
Per-warehouse material settings (min/max levels).

| Column | Type | Notes |
|--------|------|-------|
| setting_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| material_id | UUID FK | → Material |
| min_quantity | DECIMAL(18,3) | |
| max_quantity | DECIMAL(18,3) | |
| reorder_point | DECIMAL(18,3) | |
| status | VARCHAR(20) | Active / Inactive |

### StockMovement (Append-only)
Ledger of every inventory change. Never updated or deleted.

| Column | Type | Notes |
|--------|------|-------|
| movement_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| material_id | UUID FK | → Material |
| document_id | UUID FK | → WarehouseDocument |
| line_id | UUID FK | → DocumentLine (UNIQUE with document_id and movement_type) |
| movement_type | VARCHAR(30) | Receiving / Issue / TransferIn / TransferOut / Adjustment / Opening |
| quantity | DECIMAL(18,3) | Positive = increase, Negative = decrease |
| quantity_before | DECIMAL(18,3) | Balance before this movement |
| quantity_after | DECIMAL(18,3) | Balance after this movement |
| posted_at | TIMESTAMP | |

<!-- OpeningBalance removed in v5 — folded into WarehouseDocument per D-OPEN-01; initial stock uses document_type = Opening. -->

---

## 6. Operations Domain (7 tables) — The Spine & Petals

### WarehouseDocument (Spine)
The unified document table. One row per document of any type. Shared fields live here.

| Column | Type | Notes |
|--------|------|-------|
| document_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| created_by | UUID FK | → User |
| document_type | VARCHAR(30) | Receiving / Issue / Transfer / Adjustment / Opening / Return |
| paper_document_number | VARCHAR(100) | External document number |
| system_reference_number | VARCHAR(100) UNIQUE | System-generated number |
| document_status | VARCHAR(20) | Draft / Submitted / Posted / Reversed / Cancelled / Rejected |
| notes | TEXT | |
| created_at | TIMESTAMP | |
| posted_at | TIMESTAMP nullable | |

**Relationships:** `1:N → DocumentLine`, `1:1? → ReceivingInfo`, `1:1? → IssueTo`, `1:N → InventoryAdjustment`, `1:N → StockMovement`

### DocumentLine
Line items for any document type. Shared across all operations.

| Column | Type | Notes |
|--------|------|-------|
| line_id | UUID PK | |
| document_id | UUID FK | → WarehouseDocument |
| material_id | UUID FK | → Material |
| line_type | VARCHAR(30) | Normal / Asset |
| quantity | DECIMAL(18,3) | Entered quantity |
| unit_id | UUID FK nullable | → UnitOfMeasure |
| conversion_id | UUID FK nullable | → MaterialUnitConversion; selected snapshot |
| conversion_factor | DECIMAL(18,6) nullable | Factor snapshot when conversion is used |
| base_quantity | DECIMAL(18,3) | In base unit |
| unit_price | DECIMAL(18,2) nullable | |
| batch_number | VARCHAR(100) nullable | |
| expiry_date | DATE nullable | |

### ReceivingInfo (Petal)
Extension table for Receiving documents — supplier and invoice data.

| Column | Type | Notes |
|--------|------|-------|
| document_id | UUID PK FK | → WarehouseDocument (1:1) |
| supplier_name | VARCHAR(300) | Free text + autocomplete |
| invoice_number | VARCHAR(100) | |
| delivery_note | TEXT nullable | |
| invoice_image_path | VARCHAR(500) nullable | |

### IssueTo (Petal)
Extension table for Issue documents — polymorphic recipient.

| Column | Type | Notes |
|--------|------|-------|
| issue_to_id | UUID PK | |
| document_id | UUID FK UNIQUE | → WarehouseDocument (1:1) |
| recipient_type | VARCHAR(30) | Employee / OrganizationalUnit / Site / ExternalEntity |
| recipient_id | UUID | Polymorphic ID of recipient |
| notes | TEXT | |

### DocumentAttachment
Files attached to documents (signed copies, supporting docs).

| Column | Type | Notes |
|--------|------|-------|
| attachment_id | UUID PK | |
| document_id | UUID FK | → WarehouseDocument |
| file_path | VARCHAR(500) | |
| original_filename | VARCHAR(500) | |
| checksum | VARCHAR(64) | SHA-256 |

### supplier_autocomplete
Helper table for supplier name autocomplete — populated automatically, no management UI needed.

| Column | Type | Notes |
|--------|------|-------|
| name | VARCHAR(300) PK | Supplier name (unique) |
| use_count | INT | |
| last_used_at | TIMESTAMP | |

---

## 7. Asset Domain (2 tables)

### Asset
An individual instance of an Asset-type material. It has a required internal
enterprise asset number and an optional manufacturer serial number; the two
identifiers are not interchangeable.

| Column | Type | Notes |
|--------|------|-------|
| asset_id | UUID PK | |
| material_id | UUID FK | → Material |
| warehouse_id | UUID FK nullable | → Warehouse |
| receipt_line_id | UUID FK nullable | → DocumentLine |
| asset_number | VARCHAR(100) UNIQUE NOT NULL | Required internal asset number |
| serial_number | VARCHAR(200) nullable | Optional manufacturer serial |
| acquisition_date | DATE | |
| warranty_expiry | DATE nullable | |
| row_version | INTEGER | |

**Note v5:** `status` column removed per D-AST-02. Asset status is derived via view `v_asset_current_status` from Custody and AssetMovementHistory. No `current_custody_id` — custody status is tracked via CustodyHistory. No `UnderMaintenance` in v1.

### AssetMovementHistory (Append-only)
Ledger of all asset movements.

| Column | Type | Notes |
|--------|------|-------|
| movement_id | UUID PK | |
| asset_id | UUID FK | → Asset |
| document_id | UUID FK | → WarehouseDocument |
| movement_type | VARCHAR(30) | Received / Transferred / Issued / Returned |
| moved_at | TIMESTAMP | |

---

## 8. Custody Domain (2 tables)

### Custody (Unified)
Tracks who is responsible for an Asset in the historical physical schema.
Polymorphic holder replaces separate Personal/Operational tables. D-MAT-01's
provisional OpenAPI extends custody with `MaterialQuantity` and `TrackedUnit`
subjects for Durable partial assignment/return; backend implementation and
API-owner ratification remain required.

| Column | Type | Notes |
|--------|------|-------|
| custody_id | UUID PK | |
| asset_id | UUID FK | → Asset |
| holder_type | VARCHAR(30) | Personal / Operational / Departmental |
| holder_id | UUID | Polymorphic — → Employee or → OrganizationalUnit |
| custody_kind | VARCHAR(30) | Personal / Operational |
| issue_document_id | UUID FK | → WarehouseDocument |
| return_document_id | UUID FK nullable | → WarehouseDocument |
| status | VARCHAR(30) | Pending / Active / Returned / Transferred / Lost |
| issued_at | TIMESTAMP | |

**Key design:** `holder_type` + `holder_id` replaces having separate `employee_id` and `org_unit_id` columns. `custody_kind` determines the type of responsibility (Personal = employee, Operational = department).

### CustodyHistory (Append-only)
Ledger of all custody changes.

| Column | Type | Notes |
|--------|------|-------|
| history_id | UUID PK | |
| custody_id | UUID FK | → Custody |
| asset_id | UUID FK | → Asset |
| change_type | VARCHAR(30) | Assigned / Transferred / Returned / Lost |
| change_date | TIMESTAMP | |

---

## 9. Count & Adjustment Domain (4 tables)

### InventoryCount
A count session. SoftFreeze warns but doesn't block.

| Column | Type | Notes |
|--------|------|-------|
| count_id | UUID PK | |
| warehouse_id | UUID FK | → Warehouse |
| created_by | UUID FK | → User |
| count_type | VARCHAR(30) | Full / Partial / SpotCheck / AssetVerification |
| freeze_policy | VARCHAR(20) | SoftFreeze / NoFreeze |
| status | VARCHAR(20) | Planned / InProgress / Completed / Reviewed |
| notes | TEXT | |
| counted_at | TIMESTAMP nullable | |
| reviewed_at | TIMESTAMP nullable | |
| row_version | INTEGER | |

### InventoryCountLine
Line items counted in a session.

| Column | Type | Notes |
|--------|------|-------|
| count_line_id | UUID PK | |
| count_id | UUID FK | → InventoryCount |
| material_id | UUID FK | → Material |
| asset_id | UUID FK nullable | → Asset (for asset verification) |
| system_quantity | DECIMAL(18,3) | What the system thinks |
| actual_quantity | DECIMAL(18,3) | What was actually counted |
| difference | DECIMAL(18,3) | actual - system (computed) |

### InventoryAdjustment (Petal)
An adjustment document linked to a count. Uses WarehouseDocument as Spine.

| Column | Type | Notes |
|--------|------|-------|
| adjustment_id | UUID PK | |
| count_id | UUID FK nullable | → InventoryCount |
| document_id | UUID FK | → WarehouseDocument |
| status | VARCHAR(20) | Draft / Submitted / Approved / Posted |
| reason | TEXT | |

### AdjustmentLine
Items adjusted.

| Column | Type | Notes |
|--------|------|-------|
| adjustment_line_id | UUID PK | |
| adjustment_id | UUID FK | → InventoryAdjustment |
| material_id | UUID FK | → Material |
| adjustment_type | VARCHAR(20) | Increase / Decrease |
| quantity | DECIMAL(18,3) | |

---

## 10. Supporting Domain (2 tables)

### AuditLog (Append-only)
Audit log header — one row per operation (D-AUD-01). Per-field details in AuditLogEntry.

| Column | Type | Notes |
|--------|------|-------|
| audit_id | UUID PK | |
| user_id | UUID FK | → User |
| entity_type | VARCHAR(50) | Entity name (e.g., WarehouseDocument) |
| entity_id | UUID | |
| action | VARCHAR(30) | Create / Update / Delete / Approve / Post / Cancel |
| summary | JSONB nullable | Optional high-level summary (replaces old_values/new_values from v4) |
| ip_address | VARCHAR(50) | |
| created_at | TIMESTAMP | |

### AuditLogEntry (Append-only) *(new in v5)*
One row per changed field. Enables indexed per-field search.

| Column | Type | Notes |
|--------|------|-------|
| entry_id | UUID PK | |
| log_id | UUID FK | → AuditLog |
| field_name | VARCHAR(100) | Changed field name |
| old_value | TEXT nullable | Value before change |
| new_value | TEXT nullable | Value after change |

---

## Key Relationships Summary

```
Organization 1──N Site 1──N Warehouse 1──N WarehouseDocument 1──N DocumentLine
                                       │
                                       ├──N StockMovement 1──1 InventoryBalance
                                       │
                                       ├──1 ReceivingInfo    (if Receiving)
                                       ├──1 IssueTo          (if Issue)
                                       └──N InventoryAdjustment (if Adjustment)

Site 1──N OrganizationalUnit (self-ref)
OrganizationalUnit 1──N Employee
Employee 1──1? User
User N──N Role (via UserRoleScope)
Role N──N Permission (via RolePermission)

MaterialDomain 1──N MaterialCategory 1──N MaterialFamily 1──N Material
Material 1──N InventoryBalance
Material 1──N Asset
Asset 1──N Custody
Custody 1──N CustodyHistory

InventoryCount 1──N InventoryCountLine
InventoryCount 1──1 InventoryAdjustment
WarehouseDocument 1──N InventoryAdjustment

Warehouse 1──N WarehouseCapability 1──N WarehouseCapabilityOperation
Warehouse 1──N InventoryCount
AuditLog 1──N AuditLogEntry
```

---

## Design Pattern Summary

| Pattern | Where | Why |
|---------|-------|-----|
| Spine + Petals | WarehouseDocument + ReceivingInfo/IssueTo/InventoryAdjustment | Unified lifecycle, new document type = new Petal only |
| Polymorphic FK | IssueTo (recipient_type+recipient_id), Custody (holder_type+holder_id) | One table instead of many |
| Append-only Ledger | StockMovement, AuditLog, AuditLogEntry, CustodyHistory, AssetMovementHistory | Immutable audit trail |
| Self-referencing | OrganizationalUnit, MaterialCategory | Supports unlimited hierarchy levels |
| Soft Delete | User, Material, Warehouse | Never lose reference data |
| Optimistic Concurrency | row_version on balance/adjustment tables | Prevent lost updates |
| SELECT FOR UPDATE | InventoryBalance reads inside transactions | Prevent race conditions |

## Deferred to v2+

| Table | Reason |
|-------|--------|
| StorageLocation | Warehouses are small initially — no internal organization needed |
| MaterialAttribute | JSONB on Material covers this in v1 |
| Supplier | Replaced by supplier_name + supplier_autocomplete |
| Notification | Frontend-only (in-memory) notifications in v1 |
| ~~OpeningBalance~~ (removed v5) | Folded into WarehouseDocument per D-OPEN-01 |
