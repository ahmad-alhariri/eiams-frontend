# Material Classification and Custody Policy Decision

**Status:** Accepted for EIAMS v1 planning, contract work, and implementation  
**ID:** D-MAT-01  
**Beads:** `eiams-frontend-bt60`, `eiams-frontend-e10-t09`, `eiams-frontend-e01-t02`, `eiams-frontend-e19-t01`–`e19-t09`  
**Decision date:** 2026-08-14

## Decision

EIAMS classifies every catalog material by its business nature first. Tracking,
asset registration, and custody are consequences of that classification; they
are not interchangeable switches.

| Material kind | Tracking | Enterprise asset number | Manufacturer serial | Responsibility after issue | Asset registry |
| --- | --- | --- | --- | --- | --- |
| `Consumable` | `Quantity` only | Prohibited | Not a catalog/asset requirement | No custody; warehouse responsibility ends at posted issue | Prohibited |
| `Durable` | `Quantity` or `Serial` | Prohibited | Allowed only when `Serial` is selected | Mandatory custody | Prohibited |
| `Asset` | `Serial` only | Required, enterprise-wide unique | Optional manufacturer identifier | Mandatory custody | Required; one Asset record per unit |

An **asset number** is EIAMS's internal, stable, enterprise-wide identifier for
a fixed asset. A **serial number** identifies a manufacturer or an otherwise
distinguishable unit. They are different concepts: a durable may have a serial
number without becoming a fixed asset, and an asset must receive an internal
asset number even when the manufacturer did not supply a serial number.

`Asset` is an accounting classification. A serial number alone never changes a
Consumable or Durable into an Asset; financial capitalization and depreciation
remain asset-registry/accounting concerns.

## Operational consequences

- Receiving or opening an Asset creates exactly one Asset registry record per
  unit, an internal asset number, and the canonical `Received` event.
- Issuing a Durable or Asset must create responsibility for the selected active
  counterpart. Consumables create no responsibility record.
- Asset custody continues to use the existing asset-backed lifecycle and
  derived asset status. Durable custody must not create an Asset record or an
  AssetMovementHistory event.
- A Quantity-tracked Durable supports partial assignment and partial return by
  quantity. A Serial-tracked Durable supports assignment/return by identified
  unit. Asset custody remains unit-based.

## Provisional Custody contract expansion

The historical Schema v5 `Custody` table is **asset-backed only**. D-MAT-01 is
represented in the architecture-owned provisional OpenAPI `1.0.0-provisional.6`
as an extension of the responsibility subject to one of:

- `Asset` — one fixed-asset unit; or
- `MaterialQuantity` — a material plus a positive quantity; or
- `TrackedUnit` — an identified Durable unit without an Asset record.

The exact relational representation is contract-owned, but every responsibility
record must expose its subject kind/identity, holder, custody kind, source
issue document, optional return document, active/closed period, and the
quantity where applicable. It must support partial assignment and partial
return without mutating historical custody or ledger rows. Existing
asset-specific derived-status semantics apply only to `Asset` subjects.

The provisional contract now makes the required shape available for generated
frontend types and mocks. Backend implementation and API-owner ratification
remain blocking production-integration work; until then the frontend may
present neither a fake asset nor a client-only Durable custody timeline.

## Change control and legacy data

Before the first posted movement for a material, an authorized catalog editor
may change its kind/tracking combination after explicit confirmation; dependent
values are reset and the change is audit logged. After the first posted
movement, kind and tracking are immutable. Asset registration, stock history,
and custody evidence therefore cannot be reinterpreted retroactively.

Legacy materials that violate this matrix remain readable and auditable. The
server must flag them for an authorized, documented remediation workflow; it
must not silently normalize them. A remediation outcome is either a permitted
pre-movement correction or a migration/administrative action with explicit
audit evidence.

## Contract and implementation requirements

The generated contract must make the derived policy machine-readable rather
than exposing a contradictory editable `requiresAssetNumber` boolean. It must
validate the matrix on all catalog writes and enforce it again when posting a
document. `e10-t09` owns the catalog UI behavior once the generated contract
exposes the required fields. `e01-t02` owns the contract inventory and the
Custody extension is required before the downstream custody work (`e19`).

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Treat `requiresAssetNumber` as an independent toggle | It permits impossible combinations such as a consumable with an asset number or an Asset without one. |
| Create Asset records for Durable materials | It incorrectly turns operational tools into accounting assets and pollutes asset depreciation/reporting. |
| Give every serial-tracked unit an asset number | A serial identifies a unit; it is not proof of capitalization. |
| Skip Durable custody | It loses the accountability required for operational tools. |
| Store Durable custody only in the browser | It is not auditable, cannot support partial returns, and violates the document-driven model. |
