# Issue-Line Existing-Asset Reference Contract Decision

**Decision ID:** D-IAR-01
**Status:** Approved by repository owner (ratified in-session, 2026-08-24)
**Beads:** `eiams-frontend-9h27` (decision) · unblocks `eiams-frontend-e16-t05`
**Contract version:** `1.0.0-provisional.9`

## Decision

EIAMS v1 Issue documents reference **existing assets** on their lines through a
new optional `assetIds: Uuid[]` field on `DocumentLineInput`, plus a matching
read projection `issuedAssetIds: Uuid[]` on `DocumentLine`.

## Problem

PRD §12.3 step 3 requires the warehouse keeper to "select the specific asset
serial/ID" for asset-type Issue lines, and D-AST-02 derives `Issued` status per
specific asset via `v_asset_current_status`. The provisional contract
(`1.0.0-provisional.8`) had no way to express that selection:
`DocumentLineInput.assetInputs` **creates new assets** (Receiving/Opening
acquisition) and is mutually exclusive with referencing existing stock; no
other field carried an existing-asset identity. An Issue draft could state
"issue 2 computers" but never "these two specific assets", leaving the server
unable to determine which units to move to `Issued`.

## Contract change

### Write side — `DocumentLineInput.assetIds` (new, optional)

```json
"assetIds": {
  "type": "array",
  "description": "Allowed only for Issue lines whose material is Asset-kind. References existing assets to issue: every id must resolve to an Asset that is currently InStock and belongs to the line's material in the source warehouse, and the count must equal the line quantity. Mutually exclusive with assetInputs.",
  "items": { "$ref": "#/components/schemas/Uuid" }
}
```

Server-side validation obligations (normative for the backend):

1. Every id resolves to an existing Asset.
2. Each asset's derived status is `InStock` at posting time.
3. Each asset's material equals the line's material.
4. Each asset's current warehouse equals the document's source warehouse.
5. `assetIds.length === quantity` (mirrors the `trackedUnitInputs` /
   `assetInputs` count-equals-quantity precedent).
6. `assetIds` and `assetInputs` are mutually exclusive on one line.

### Read side — `DocumentLine.issuedAssetIds` (new, optional)

```json
"issuedAssetIds": {
  "type": "array",
  "description": "Projected on Issue Asset-kind lines: ids of the specific existing assets this line issued (resolved from the draft's assetIds and frozen on posting). Null/absent for non-Issue or non-Asset lines.",
  "items": { "$ref": "#/components/schemas/Uuid" }
}
```

The projection lets detail pages render exactly which assets an issued line
moved, without exposing internal custody joins.

## Semantics preserved

- Draft persistence keeps `assetIds` verbatim (same as other draft inputs);
  posting freezes the resolved set into `issuedAssetIds`.
- Custody creation on posting remains server-owned (D-MAT-01 / PRD §12.3
  step 6): each referenced asset transitions to `Issued` under the recipient's
  custody kind (Personal for Employee, Operational otherwise).
- No new endpoints; `/assets` listing (already contracted, consumed by the
  frontend asset module since e18-t01) supplies selector options filtered by
  `status=InStock`, `materialId`, and `warehouseId`.

## Alternatives rejected

- **Reuse `assetInputs` with nullable asset numbers** — conflates acquisition
  with issuance; breaks the established meaning of that field and its
  Receiving-only validation.
- **Free-text serial entry** — contradicts D-POST-01's principle that asset
  identities are UUID references, not free text.
- **New dedicated endpoint (`/issue-lines/assets`)** — unnecessary surface;
  the spine+petal draft payload already carries line-level data.

## Frontend consequences (this repository)

- Generated types regenerate from `provisional.9`
  (`pnpm api:types:generate`; provenance hash updated).
- Mock engine persists `issueTo` + line `assetIds` verbatim on drafts and
  projects `issuedAssetIds` after posting; browser MSW gains an
  `InStock` fixture set at المستودع المركزي so the t05 selector has live data.
- `e16-t05` builds the per-line selector against `/assets` with
  `count == quantity` enforcement and blocks save until satisfied — same gate
  pattern as the balance ceiling.

## Ratification note

Recorded under the architecture-owned provisional track
(`eiams-frontend-e01.7`): this change is owner-approved design-first evolution
of the provisional snapshot; production ratification still compares the
implemented backend against `provisional.9`.
