# Material Unit-Conversion Policy Decision

**Status:** Accepted for EIAMS v1 planning, provisional contract work, and implementation  
**ID:** D-UOM-01  
**Beads:** `eiams-frontend-vded`, `eiams-frontend-e10-t11`, `eiams-frontend-e01-t02`  
**Decision date:** 2026-08-14

## Decision

Every `Material` has exactly one **base unit**. Inventory balances, posted
stock movements, and the canonical quantity on a `DocumentLine` are expressed
in that material's base unit. The base unit belongs to the Material, not to
the MaterialFamily and not to a warehouse.

`UnitOfMeasure` is a reusable reference vocabulary only: names such as
`Piece`, `Carton`, `Box`, and `Bag` have no global quantity meaning. A
`MaterialUnitConversion` is the per-material relationship that makes a unit
an alternate unit for that particular Material. Each active relationship
converts directly to that Material's base unit; there is no conversion graph
or global `Carton = n` rule.

The fixed interpretation is:

```text
1 alternate unit = factor × units of the Material base unit
```

`factor` is a strictly positive `DECIMAL(18,6)` value. For example:

| Material | Base unit | Alternate unit | Factor | Meaning |
| --- | --- | --- | ---: | --- |
| Blue pen | Piece | Carton | 12.000000 | 1 carton = 12 pieces |
| Printer ink | Box | Carton | 6.000000 | 1 carton = 6 boxes |

The same `Carton` reference unit therefore has a different factor for each
material. If a material is always received and issued by carton, `Carton` may
itself be that material's base unit and no conversion is necessary.

## Invariants

- A Material has one, non-null base unit. The server owns the resulting base
  unit on a conversion; a caller cannot select another target unit.
- An alternate unit converts directly to the Material's base unit only.
- `factor` must be greater than zero and is represented with
  `DECIMAL(18,6)` precision.
- A conversion from the Material base unit to itself is prohibited.
- There is at most one active conversion for `(materialId, fromUnitId)`.
  The same alternate unit may legitimately occur for different materials.
- Writes must reject inactive references, out-of-scope materials, duplicate
  active conversions, invalid factors, and stale optimistic-concurrency
  versions. Catalog read/write authorization and scope are verified by the
  server; the browser's permission gate is not sufficient authorization.

## History and change control

Posted documents must retain their original commercial and inventory meaning.
Each converted `DocumentLine` records the selected `conversionId`, its
`conversionFactor`, and the resulting `baseQuantity` snapshot at posting.
Historical lines and ledger effects are never recalculated from a later
conversion record.

A conversion that has been used by a posted document cannot be deleted or
overwritten. When packaging changes, an authorized catalog editor archives or
deactivates the old conversion and creates a new active conversion. For
example, receiving ten pen cartons at a factor of 12 always remains 120
pieces, even if a later supplier carton contains ten pieces.

## Provisional contract boundary

The approved policy requires a versioned, provisional API surface for reading,
creating, and updating a material's conversions. Its read model exposes the
material, alternate unit, server-derived base unit, factor, active state, and
`rowVersion`; its write model uses optimistic concurrency. The exact endpoint
and generated type names remain provisional until backend/API-owner
ratification. The frontend must consume generated contract types and must not
invent a competing transport model.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| A global `Carton = 12` conversion | A carton can hold 12 pens and 6 ink boxes; the unit name does not define packaging content. |
| Family-level base unit | Materials in the same family can have distinct accountable quantities and packaging. The balance unit must be owned by the specific Material. |
| Alternate-to-alternate conversion chains | They create multiple paths, repeated rounding, and ambiguous audit explanations. Direct conversion to the base unit keeps one authoritative balance. |
| Recalculate old lines after a factor edit | It changes posted stock history and breaks reconciliation with signed documents. |
| Delete a used conversion | It removes the evidence required to explain a posted line's original quantity. |
