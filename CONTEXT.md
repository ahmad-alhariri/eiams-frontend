# EIAMS Inventory, Asset, and Custody Context

The EIAMS context governs catalogued materials, warehouse stock, fixed assets,
and responsibility for issued property. It gives each term one business meaning
so accounting identity, physical identification, and custody do not drift.

## Material classification

**Consumable**:
A material consumed by normal use and issued by quantity without an asset record
or custody.
_Avoid_: disposable asset, low-value asset

**Durable**:
An operational tool or item that remains accountable after issue but is not a
fixed asset. It may be quantity-tracked or identified by serial.
_Avoid_: non-fixed asset, small asset

**Asset**:
A fixed, accounting-classified item registered individually by EIAMS and held
under custody. An Asset is not defined by the presence of a serial number.
_Avoid_: serial-tracked material, equipment item

**Material Kind**:
The authoritative classification of a Material as Consumable, Durable, or
Asset. It determines the permitted tracking and accountability consequences.
_Avoid_: material type, asset flag

**Tracking Type**:
The way a Material's stock units are distinguished: Quantity or Serial.
_Avoid_: asset type, accounting type

## Measurement and packaging

**Base Unit**:
The single unit in which one Material's inventory quantity is canonical. It is
owned by the Material, not by a family, warehouse, or generic unit name.
_Avoid_: family base unit, warehouse base unit

**Alternate Unit**:
A reusable unit name, such as Carton, Box, or Bag, used for one Material under
a Material Unit Conversion. Its packaging quantity is not global.
_Avoid_: global unit, source unit

**Material Unit Conversion**:
The material-specific relationship from one Alternate Unit directly to that
Material's Base Unit, with a positive factor.
_Avoid_: global conversion, conversion chain

**Conversion Snapshot**:
The original conversion identity, factor, and base quantity associated with a
posted DocumentLine.
_Avoid_: recalculated historical conversion

## Identity and accountability

**Asset Number**:
The enterprise-wide unique internal identifier assigned to an Asset. It is
required for every Asset and prohibited for Consumables and Durables.
_Avoid_: serial number, manufacturer number

**Serial Number**:
A manufacturer or operational identifier for a distinguishable physical unit.
It may identify a Durable or Asset but never establishes fixed-asset status.
_Avoid_: asset number

**Custody Subject**:
The property whose responsibility is recorded: an Asset, a quantity of a
Durable Material, or a serial-tracked Durable unit.
_Avoid_: asset, holder

**Custody**:
The auditable responsibility timeline for a Custody Subject and a holder. It is
mandatory after issuing a Durable or Asset and absent for Consumables.
_Avoid_: stock balance, ownership

**Holder**:
The active counterpart responsible for a Custody Subject.
_Avoid_: recipient, custodian
