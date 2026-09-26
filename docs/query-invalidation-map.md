# TanStack Query Invalidation Map

> **Authoritative source:** This document records the *current* invalidation behavior of every mutation hook in the frontend. It is derived from the implementation in `src/shared/services/query-keys.ts` and each module's mutation hooks. When a mutation hook changes, update this document.

## Design principle

Per RESOLUTION-006 / FE-Q-FND-003, mutation invalidation must be:

1. **Precise** — invalidate only the keys that the mutation actually changed.
2. **Scoped** — scoped keys include the active authorization scope so different scopes never collide.
3. **Documented** — every cross-aggregate effect must be visible here.

## Key factory contract

All keys are built from the central factory in `src/shared/services/query-keys.ts`:

```
public(resource, ...parts)     → ["public", resource, ...parts]
scoped(scope, resource, ...parts) → ["scoped", scope.kind, scope.id?, resource, ...parts]
scopeOnly(scope)               → ["scoped", scope.kind, scope.id?]
```

Scoped keys prevent cross-context collisions. Public keys are used only for genuinely unscoped data.

## Resource tree

Every scoped resource lives under:

```
["scoped", scope.kind, scope.id?, RESOURCE_NAME, ...rest]
```

The resource names used across modules:

| Resource name | Module ownership | Notes |
|---|---|---|
| `admin` | Admin | roles, users, permissions |
| `catalog` | Catalog | domains, categories, families, materials, unitsOfMeasure, unitConversions |
| `warehouse` | Warehouse | warehouses, capabilities, material-settings |
| `document` | Shared documents | documents, history, policy |
| `inventory` | Inventory | balances, movements |
| `inventory-counts` | Inventory Count | counts, count, lines |
| `adjustments` | Adjustment | adjustments, adjustment, disposal-eligible-assets |
| `asset` | Asset | assets, custody, movements |
| `custody` | Custody | custodies |
| `auth` | Auth | session |

## Invalidation helpers

The central factory exports these helpers. Modules must prefer them over raw `queryClient.invalidateQueries({ queryKey: [...] })` calls.

### `invalidateScopedQueries(client, scope)`

Invalidates every key that starts with `["scoped", scope.kind, scope.id?]`.

Used when: the active scope changed, or a mutation affects every resource under that scope.

### `invalidateResourceTree(client, scope, resource, furtherParts?)`

Invalidates every key that starts with `["scoped", scope.kind, scope.id?, resource, ...furtherParts]`.

Used when: a mutation changes a resource and all of its sub-resources.

Example: after updating warehouse `wh-1`, invalidate `["scoped", "warehouse", "wh-1", "warehouses", "wh-1"]` and everything under it (capabilities, material-settings).

### `invalidateResourceInstance(client, scope, resource, instanceId, furtherParts?)`

Shorthand for invalidating a specific instance and its children.

Equivalent to `invalidateResourceTree(client, scope, resource, [instanceId, ...furtherParts])`.

### `invalidateResourceLists(client, scope, resource, listName)`

Invalidates only list queries for a resource — keys that end in an object (the filter/pagination blob).

Does NOT invalidate detail or sub-resource keys.

Used when: creating or deleting a resource so the list refetches, but detail views of other items remain fresh.

### `removeScopedQueries(client)` / `clearScopedQueries(client)`

Removes all scoped keys. Used during scope switch or session revocation.

### `removeProtectedQueries(client)` / `clearProtectedQueries(client)`

Removes scoped keys AND the auth session key. Used during logout.

## Module invalidation map

For each mutation, record what it invalidates and why.

### Admin module (`src/modules/admin/hooks/use-admin-mutations.ts`)

| Mutation | Scope keys invalidated | Public/session keys | Rationale |
|---|---|---|---|
| `useCreateRoleMutation` | `["scoped", scope, "admin"]` (broad) | `auth.session` | New role changes the permission catalog; broad invalidation because role definitions are referenced by many downstream queries. Session invalidated because effective permissions may change. |
| `useUpdateRoleMutation` | `["scoped", scope, "admin"]` (broad) | `auth.session` | Same as create. |
| `useCreateUserMutation` | `["scoped", scope, "admin"]` (broad) | `auth.session` | New user may affect list display; session not strictly required but safe. |
| `useUpdateUserMutation` | `["scoped", scope, "admin"]` (broad) | `auth.session` | Same as create. |
| `useReplaceUserRoleScopesMutation` | `["scoped", scope, "admin"]` (broad) | `auth.session` | Assignment changes effective permissions — session MUST be invalidated. Broad admin invalidation because user list and assignment list both change. |

**Note:** Admin broad invalidation is acceptable because admin resources are relatively small and infrequent. For high-volume resources (inventory, documents), prefer precise invalidation.

### Catalog module (`src/modules/catalog/hooks/use-catalog-mutations.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `useCreateMaterialDomainMutation` | `["scoped", scope, "catalog"]` (broad) | New domain changes hierarchy; broad invalidation is acceptable for master data. |
| `useUpdateMaterialDomainMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useCreateMaterialCategoryMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useUpdateMaterialCategoryMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useCreateMaterialFamilyMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useUpdateMaterialFamilyMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useCreateMaterialMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useUpdateMaterialMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useCreateUnitOfMeasureMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useUpdateUnitOfMeasureMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useCreateMaterialUnitConversionMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |
| `useUpdateMaterialUnitConversionMutation` | `["scoped", scope, "catalog"]` (broad) | Same. |

**Note:** Catalog data is master data with `MASTER_DATA_STALE_TIME` (5 min). Broad invalidation is acceptable because these resources change infrequently and the list is small. The mutation also installs the updated resource into cache.

### Warehouse module (`src/modules/warehouse/hooks/use-warehouse-mutations.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `useCreateWarehouseMutation` | `["scoped", scope, "warehouse", "warehouses", {}]` (list only) | Creates a new warehouse; list must refetch. Detail of the new warehouse will fetch on demand. |
| `useUpdateWarehouseMutation` | `["scoped", scope, "warehouse", "warehouses", warehouseId]` + `["scoped", scope, "warehouse", "warehouses", {}]` | Updates a warehouse; both the detail and all list variants must refetch. |
| `useReplaceWarehouseCapabilitiesMutation` | `["scoped", scope, "warehouse", "warehouses", warehouseId, "capabilities"]` | Capabilities are a sub-resource; only that subtree changes. |
| `useUpsertWarehouseMaterialSettingMutation` | `["scoped", scope, "warehouse", "warehouses", warehouseId, "material-settings", {}]` | Material settings list for the warehouse must refetch. |

**Note:** Warehouse mutations use precise invalidation. The mutation installs the updated resource into cache.

### Inventory Count module (`src/modules/inventory-count/hooks/use-count-queries.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `usePlanCountMutation` | `["scoped", scope, "inventory-counts", "count", countId]` + list variants of counts, lines | New count appears in lists; detail and lines of the new count must be available. |
| `useStartCountMutation` | Same as plan | Count status changes; lists with status filters must refetch. |
| `useUpdateCountLinesMutation` | Same as plan | Lines change; both lines list and count detail must refetch. |
| `useCompleteCountMutation` | Same as plan | Status transitions to Completed; lists refetch. |
| `useCloseCountMutation` | Same as plan | Status transitions to Closed; lists refetch. |

**Note:** Count mutations use `invalidateResourceInstance` for the specific count and `invalidateResourceLists` for list variants. This is precise invalidation.

### Adjustment module (`src/modules/adjustment/hooks/use-adjustment-queries.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `useCreateAdjustmentMutation` | `["scoped", scope, "adjustments"]` (broad) + `["scoped", scope, "inventory"]` + `["scoped", scope, "asset"]` + `["scoped", scope, "custody"]` | Adjustment posting changes stock (inventory), moves assets, and may close custody. All affected aggregates must invalidate. |
| `useUpdateAdjustmentMutation` | Same as create | Same cross-aggregate effects. |
| `usePostAdjustmentMutation` | Same as create | Same cross-aggregate effects. |
| `useReverseAdjustmentMutation` | Same as create | Same cross-aggregate effects. |

**Note:** Adjustment is the only module with documented cross-aggregate invalidation. The cross-module resources (`inventory`, `asset`, `custody`) are invalidated at the resource-tree level because adjustments affect ledgers, asset statuses, and custody states.

### Document module (`src/shared/documents/use-document-draft-mutations.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `useCreateDocumentMutation` | `["scoped", scope, "document", "documents"]` (lists only, via predicate) | New document appears in all list filter variants. |
| `useUpdateDocumentMutation` | Same as create + `["scoped", scope, "document", "documents", documentId]` (detail branch) | Updated document must refetch in lists and detail. |

**Note:** Document mutations use a custom predicate for list invalidation (to match all filter variants) and precise invalidation for the detail branch. Lifecycle actions (`useDocumentLifecycleAction`) additionally install the authoritative result into the detail cache and invalidate the detail branch.

### Custody module (`src/modules/custody/hooks/use-custody-queries.ts`)

| Mutation | Scope keys invalidated | Rationale |
|---|---|---|
| `useAssignCustodyMutation` | `["scoped", scope, "custody"]` (broad) + `["asset"]` (public) | Custody changes move assets between derived statuses; asset registry must refetch. |
| `useTransferCustodyMutation` | Same as assign | Same cross-resource effect. |

**Note:** Custody invalidation also touches public `["asset"]` keys because asset derived status depends on custody state.

## Mutation result installation

Per AC-3, mutations must install authoritative server results into cache rather than relying on stale inference.

### Where result installation is implemented

| Module | Mutation | Installs into cache |
|---|---|---|
| Admin | `useCreateRoleMutation` | Role detail cache |
| Admin | `useUpdateRoleMutation` | Role detail cache |
| Admin | `useCreateUserMutation` | User detail cache |
| Admin | `useUpdateUserMutation` | User detail cache |
| Admin | `useReplaceUserRoleScopesMutation` | User role-scopes cache |
| Catalog | All create/update mutations | Respective detail cache (domain, category, family, material, unit) |
| Warehouse | `useCreateWarehouseMutation` | Warehouse detail cache |
| Warehouse | `useUpdateWarehouseMutation` | Warehouse detail cache |
| Document | `useDocumentLifecycleAction` (all lifecycle actions) | Document detail cache |
| Document | `useUpdateDocumentMutation` | Document detail cache |
| Inventory Count | Not yet implemented | List refetches only; detail installs pending |
| Adjustment | Not yet implemented (relies on invalidation) | List refetches only |
| Custody | Not yet implemented (relies on invalidation) | List refetches only |

### Where result installation is pending

These modules invalidate but do not yet install authoritative results. They are tracked for future completion:

- Inventory Count: `usePlanCountMutation`, `useStartCountMutation`, `useUpdateCountLinesMutation`, `useCompleteCountMutation`, `useCloseCountMutation`
- Adjustment: `useCreateAdjustmentMutation`, `useUpdateAdjustmentMutation`, `usePostAdjustmentMutation`, `useReverseAdjustmentMutation`
- Custody: `useAssignCustodyMutation`, `useTransferCustodyMutation`

## Stale-time policy

From `src/shared/services/query.client.ts`:

| Data type | Stale time | Rationale |
|---|---|---|
| Operational data (balances, documents, movements, counts, custody, adjustments) | 30 seconds | Changes frequently during active warehouse workflows. |
| Master data (catalog, organization, roles, permissions) | 5 minutes | Changes infrequently; longer window reduces load. |
| Mutations | No retry | Most mutations carry idempotency keys or row-version preconditions; failures are surfaced to the user. |

## Cross-context isolation

Scoped keys guarantee that different authorization contexts do not collide:

- Enterprise scope: `["scoped", "enterprise", null, ...]`
- Site scope: `["scoped", "site", "site-id", ...]`
- Warehouse scope: `["scoped", "warehouse", "wh-id", ...]`

A query fetched under one scope is never served when the active scope changes, because the key prefix includes the scope identity.

## Broad vs. precise invalidation

| Pattern | When to use | Example |
|---|---|---|
| Broad (`queryKey: scoped(scope, resource)`, `exact: false`) | Small, infrequent master data where all variants change together | Catalog, Admin |
| Resource tree (`invalidateResourceTree`) | A resource and its sub-resources change | Warehouse + capabilities + settings |
| Resource instance (`invalidateResourceInstance`) | One specific item and its children change | Update one warehouse |
| List only (`invalidateResourceLists`) | Creating/deleting items; detail views stay fresh | Create document, delete count |
| Cross-aggregate | Mutation affects multiple aggregates | Adjustment posting invalidates inventory, asset, custody |
| Session invalidation | Authorization context changes | Role/assignment changes invalidate `auth.session` |

## Out-of-scope invalidation

Public keys (e.g., `["public", "catalog"]`) are NOT invalidated by scoped mutations. Public keys are used only for genuinely unscoped reference data that is shared across all contexts.

Session invalidation (`auth.session`) is triggered when:

- A role is created/updated
- A user's role-scopes are replaced
- A user is created/updated (conservative)

Session invalidation is NOT triggered by:

- Catalog changes (permissions don't change)
- Warehouse changes (permissions don't change)
- Document mutations (permissions don't change)
- Count adjustments (permissions don't change)

## Updates to this document

This document must be updated when:

1. A new mutation hook is added.
2. An existing mutation hook changes its invalidation behavior.
3. A new cross-aggregate effect is discovered.
4. The stale-time policy changes.

Last updated: 2026-09-15 (task EIAMS-Project-vi65.3.2 implementation)
