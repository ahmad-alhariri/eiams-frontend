# Inventory read, sorting, detail, and low-stock contract decision

**Decision ID:** D-INV-READ-01  
**Status:** Accepted for the architecture-owned EIAMS v1 provisional contract  
**Owners:** Inventory module and API architecture  
**Beads:** `eiams-frontend-e14.1`, `eiams-frontend-e14.2`, `eiams-frontend-otay`

EIAMS inventory reads use server-owned, scope-filtered projections. The browser
does not sort a fetched page, reconstruct a balance from movements, or join
independently paginated balances and warehouse material settings. This decision
adds typed sorting to both inventory lists, an addressable balance detail read,
and a server-computed low-stock projection.

## List sorting

Both list operations accept optional `sortBy` and `sortDirection` query
parameters. Values are case-sensitive contract enums; arbitrary field paths,
SQL names, Arabic display labels, and aliases such as `asc` are invalid.

| Operation | Sort fields | Default |
| --- | --- | --- |
| `GET /inventory/balances` | `WarehouseDisplayName`, `MaterialDisplayName`, `Quantity`, `LastUpdated` | `WarehouseDisplayName`, `Ascending` |
| `GET /inventory/movements` | `PostedAt`, `WarehouseDisplayName`, `MaterialDisplayName`, `MovementType`, `QuantityDelta` | `PostedAt`, `Descending` |

`SortDirection` is `Ascending | Descending`. An explicitly malformed or unknown
sort value returns `400` Problem Details; the server never silently substitutes
a default for invalid input.

Ordering is stable across page requests:

- Balance default order is warehouse display name ascending, material display
  name ascending, then `balanceId` ascending.
- A selected balance primary sort is followed by warehouse display name
  ascending, material display name ascending, and `balanceId` ascending, with
  duplicate fields omitted.
- Movement default order is `postedAt` descending, then `movementId`
  descending.
- A selected movement primary sort is followed by `postedAt` descending and
  `movementId` descending, with duplicate fields omitted. When `PostedAt` is
  selected ascending, its final `movementId` tie-break is ascending.
- Display-name fields use the server's Arabic `ar-SY` collation, insensitive to
  case and Arabic diacritics. The immutable UUID tie-break remains authoritative
  when display strings compare equally.

Filtering, scope restriction, and searching are applied before sorting and
pagination. A sort/filter/search change resets the UI to `pageIndex = 0`.

## Balance identity and detail

`GET /inventory/balances/{balanceId}` returns the same `InventoryBalance` read
model used by the list. `balanceId` is the canonical route identity; the
frontend must not scan a paginated list or synthesize a warehouse/material
route. The frontend route is `/inventory/balances/:balanceId` and its parameter
maps directly to the API path parameter.

The active session owns effective scope. The client sends no scope header or
scope query parameter:

- missing or expired authentication returns `401`;
- missing `inventory.view` or no selected/effective scope returns `403`;
- an unknown balance ID returns `404`;
- an existing balance outside the effective scope also returns the same `404`
  response, preventing cross-scope enumeration.

Malformed UUID path values are rejected as `400` before lookup. A
warehouse-scoped session can read only balances for that warehouse; a
site-scoped session can read balances in that site; enterprise scope can read
all balances allowed by its permissions.

## Low-stock projection

`WarehouseMaterialSetting.minQuantity` is the only v1 low-stock threshold.
`maxQuantity` does not participate, and no `reorderPoint` is inferred. The
server evaluates the balance and setting in one authoritative read snapshot
using database decimal semantics.

Every `InventoryBalance` includes a required `lowStock` projection:

```text
lowStock.state = Low | Sufficient | NotConfigured | Disabled
lowStock.thresholdQuantity = number | null
```

| Setting condition | Comparison | State | Threshold |
| --- | --- | --- | --- |
| Active with non-null `minQuantity` | `quantity <= minQuantity` | `Low` | `minQuantity` |
| Active with non-null `minQuantity` | `quantity > minQuantity` | `Sufficient` | `minQuantity` |
| Missing setting | not evaluated | `NotConfigured` | `null` |
| Active with null `minQuantity` | not evaluated | `NotConfigured` | `null` |
| Inactive setting | not evaluated | `Disabled` | `null` |

An active zero threshold is intentional: quantity zero is Low, while any
positive quantity is Sufficient. Material or warehouse reference inactivity
does not erase a historical balance; only the matching setting's status
controls threshold alerting. A configured material without an
`InventoryBalance` is not fabricated as a zero-balance row.

The balance list accepts an optional `lowStockState` filter. The server applies
it after effective-scope restriction and before sorting/pagination, and
`PageMeta.totalItems` reports the filtered total. Omission means all states.

Canonical Arabic labels are:

| State | Arabic label |
| --- | --- |
| `Low` | `منخفض` |
| `Sufficient` | `الرصيد كافٍ` |
| `NotConfigured` | `حدّ التنبيه غير محدد` |
| `Disabled` | `تنبيه الانخفاض معطّل` |

## Compatibility guidance

- `e14-t01` consumes only generated query/response types, includes sort and
  low-stock filters in scoped TanStack Query keys, and performs no local
  threshold comparison.
- `e14-t02` enables sorting only for the four contracted balance fields and
  renders the returned low-stock state.
- `e14-t03` uses `balanceId` with the detail operation and preserves the shared
  `401`/`403`/`404` behavior.
- `e14-t04` enables sorting only for the five contracted movement fields.
- `e14-t06` filters with `lowStockState=Low`; it never joins settings in the
  browser.

Adding optional sort/filter request parameters is backward-compatible. Making
`lowStock` required on `InventoryBalance` and adding the detail operation are
additive read-contract changes for new consumers, but mocks and fixtures must
return the projection before adopting provisional contract version 8.

## Rejected alternatives

- Client-sorting the current page is globally incorrect under server
  pagination.
- Fetching a list page to locate one balance cannot guarantee that the balance
  is present and leaks route identity into presentation logic.
- Joining separately paginated settings and balances can omit matches and
  produces a client-authored business state.
- Treating equality as Sufficient delays the operational alert until stock has
  already fallen below its configured minimum.
