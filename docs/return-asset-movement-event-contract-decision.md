# Return and Asset-Movement Event Contract Decision

**Status:** Approved for EIAMS v1 frontend and OpenAPI planning  
**Beads:** `eiams-frontend-e01.4`  
**Decision date:** 2026-08-09

## Decision

EIAMS v1 has two immutable, document-derived ledgers with distinct purposes:

- **StockMovement** records the signed quantity change for a warehouse and material.
- **AssetMovementHistory** records the lifecycle event for an individual asset.

Neither ledger is edited or deleted. Every event is created by the backend in
the posting transaction for its WarehouseDocument. The frontend renders the
server-provided events and derived status; it never translates, synthesizes, or
infers a ledger event from a document status.

## Canonical v1 enums

### StockMovement

`Receipt | Issue | TransferIn | TransferOut | AdjustmentIn | AdjustmentOut | Opening`

`Return` is deliberately **not** a stock-movement type. A posted Return uses
the existing positive `Receipt` event, preserving a small, directionally clear
ledger vocabulary and the PRD's explicit return behavior.

### AssetMovementHistory

`Received | Issued | Returned | Disposed`

`Transferred` is not emitted in v1 because individual asset transfer is
deferred. Generic `Adjusted` is not emitted: asset disposal has the explicit
`Disposed` event, while any future asset correction needs its own approved
semantics.

## Document-to-event mapping

| Posted document operation | Stock event and delta | Asset event | Custody / warehouse consequence |
| --- | --- | --- | --- |
| Receiving, consumable/durable line | `Receipt`, positive quantity | None | Inventory balance increases. |
| Receiving, asset line | `Receipt`, positive quantity | `Received` per asset | Asset is placed in the receiving warehouse; no active custody. |
| Opening, consumable/durable line | `Opening`, positive quantity | None | Inventory balance is initialized. |
| Opening, asset line | `Opening`, positive quantity | `Received` per asset | Asset is placed in the opening warehouse; no active custody. |
| Issue, consumable/durable line | `Issue`, negative quantity | None | Inventory balance decreases. |
| Issue, asset line | `Issue`, negative quantity | `Issued` per asset | Asset leaves warehouse stock and the custody contract opens the required active row. |
| Transfer, non-asset line | `TransferOut`, negative source quantity and `TransferIn`, positive destination quantity | None | One atomic document transaction. |
| Return, consumable/durable line | `Receipt`, positive quantity | None | Inventory balance increases. |
| Return, asset line | `Receipt`, positive quantity | `Returned` per asset | Asset returns to the target warehouse and the active custody row closes atomically. |
| Disposal, asset currently in warehouse stock | `AdjustmentOut`, negative quantity | `Disposed` | Asset is removed from stock; any active custody is closed before the terminal event. |
| Disposal, issued/custodied asset | No additional StockMovement | `Disposed` | Active custody closes before the terminal event; no duplicate balance deduction occurs. |

The adjustment/disposal workflow decision owns role separation, document
lifecycle, asset-selection fields, and disposal authorization. This decision
owns only the events it must cause once a disposal is validly posted.

## Event payload and read-model contract

The versioned OpenAPI contract must expose immutable records containing at
least the following fields.

### Stock movement record

- `movementId`, `documentId`, `documentLineId`, `warehouseId`, `materialId`
- `movementType`, `quantityDelta`, `postedAt`, `postedBy`
- Server-provided document/material/warehouse display fields where the read
  model needs them.

### Asset movement record

- `movementId`, `assetId`, `documentId`, `documentLineId`
- `eventType`, `occurredAt`, `occurredBy`
- `fromWarehouseId` and `toWarehouseId` when meaningful to the event
- Optional linked custody identifier when the event opens or closes custody
- Server-provided asset and document display fields for ledger/history views

The document/line plus event type is idempotent within a posting operation. A
backend retry must return or preserve the same event rather than create another
ledger row. Exact persistence constraints and endpoint names are owned by
`eiams-frontend-e01-t02`.

## Derived asset-status contract

The server provides `v_asset_current_status` (or an API projection with the
same authoritative semantics). The frontend displays it read-only.

| Derived status | Required server state |
| --- | --- |
| `InStock` | No active Custody row; latest asset event is `Received` or `Returned`; a current warehouse is supplied. |
| `Issued` | Active Operational custody exists after `Issued`. |
| `InCustody` | Active Personal custody exists after `Issued` or custody assignment. |
| `Disposed` | Latest asset event is `Disposed`; no active custody exists; terminal in v1. |

The posting transaction must close custody before emitting `Returned` or
`Disposed` where custody exists, so the read model never exposes conflicting
active custody and terminal/in-stock state.

## Reversal and immutability

Posted ledgers are never updated. A supported reversal appends compensating
stock and asset events and supplies a new document/event reference in the
contract; it does not mutate the original rows.

Disposal is terminal in v1. It has no automatic reversal event. Any change to
that rule requires a separate approved product decision because it changes
asset legal status and the generic document lifecycle behavior.

## Compatibility mapping

| Historical/stale term | Required v1 interpretation |
| --- | --- |
| ERD `Return` StockMovement | `Receipt` with positive `quantityDelta` on a Return document. |
| ERD/schema `Receiving` StockMovement | `Receipt`. |
| ERD/schema generic `Adjustment` or `AdjustmentIncrease`/`AdjustmentDecrease` | `AdjustmentIn` or `AdjustmentOut`, selected from signed effect. |
| ERD/schema AssetMovement `Adjusted` | Not emitted in v1. |
| PRD/ERD/schema AssetMovement `Transferred` | Not emitted in v1; asset transfer is deferred. |
| Missing `Disposed` AssetMovement event | Add `Disposed`; it is required for the derived Disposed status. |

## Frontend compatibility guidance

- Use generated enum types and the server's Arabic display mapping; do not hardcode legacy labels or map event names in feature modules.
- Show `quantityDelta` with its server value and explain movement direction from the canonical enum, not from a locally computed balance.
- Asset history, return detail, disposal detail, movement provenance, and reports consume immutable event records and server-derived asset status.
- Loading, empty, error, and read-only state handling belongs at each query boundary; no ledger data is copied to Zustand.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Add a StockMovement `Return` event | Duplicates the PRD's positive `Receipt` semantics and fractures reporting/filtering for the same stock effect. |
| Omit `Disposed` from AssetMovementHistory | Makes the PRD's derived Disposed state impossible to prove from immutable history. |
| Use generic asset `Adjusted` for disposal | Conceals terminal legal disposal behind an ambiguous event. |
| Deduct stock again when disposing an already-issued asset | Double-counts the earlier Issue movement and corrupts InventoryBalance. |
| Recompute asset status in the frontend | Risks stale or partial custody/history data and contradicts the derived-status architecture. |

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t02` | Pin the canonical enum values, payloads, and read models in OpenAPI. |
| `e01.3` | Use the disposal event mapping after it defines disposal lifecycle and authorization. |
| `e14-t05`, `e23-t06` | Render canonical stock provenance and reports. |
| `e18-t05` | Render immutable AssetMovementHistory with canonical events. |
| `e19-t01`, `e19-t06`, `e19-t07` | Implement contract-backed custody/return services and pages. |
| `e21-t08`, `e21-t09` | Implement and verify disposal without duplicate stock movements. |
| `e23-t07`, `e24-t03`, `e24-t05` | Report and verify derived status and end-to-end event chains. |

## Consequences

The backend schema/OpenAPI must add the missing `Disposed` AssetMovement event,
standardize stock movements on the canonical vocabulary, and expose warehouse
context for asset events. This supersedes conflicting enum spellings in the
historical ERD/schema without changing the document-driven or append-only
architecture.
