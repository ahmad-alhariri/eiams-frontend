/**
 * Catalog WIRE TYPES the shared layer needs, moved verbatim from
 * `modules/catalog/types/catalog.api-types.ts` so `modules -> shared` stays the only
 * dependency direction (shared code types against these, never against the
 * module). D-INT-02 ownership is unchanged: this file mirrors the backend DTOs
 * documented in the catalog module's api-types; the module re-exports them, so
 * every existing module import keeps compiling.
 */

import type { Uuid } from '@/shared/types/wire-primitives'

/**
 * Material status as the backend SERVES it — a superset of {@link RecordStatus}
 * with the terminal `Archived` state (backend `Domain.Materials.MaterialStatus`
 * doc-comment says exactly that, and that is why it is its own enum rather than
 * the shared one).
 *
 * Applies to Material reads AND to the `status` query filter on
 * `GET /catalog/materials` (the controller binds `MaterialStatus? status`).
 */
export type MaterialStatus = 'Active' | 'Inactive' | 'Archived'

/**
 * Backend `Domain.Materials.MaterialKind` — `Consumable, Durable, Asset`.
 *
 * `Durable` MUST exist even though the frontend labels may lag: the backend
 * serves it (`MATERIAL_KIND_LABELS` in `catalog-labels.ts` is a
 * `Record<MaterialKind, string>`, so a missing key there is a compile error,
 * not a runtime blank — the lagging label is the call site's problem, not this
 * contract's). A union without `Durable` makes every durable material read
 * back as an impossible value.
 */
export type MaterialKind = 'Consumable' | 'Durable' | 'Asset'

/**
 * Backend `Domain.Materials.TrackingType` — `Quantity, Serial`.
 *
 * Previously missing from the frontend contract entirely: the create/update
 * bodies bind it as `[JsonRequired]`, so a material form that cannot express
 * it cannot save.
 */
export type TrackingType = 'Quantity' | 'Serial'

/**
 * Retained for the shared selector adapters (`named-reference-selector.ts`)
 * and for call sites that still render their own label lookups. NO catalog
 * projection nests one any more — the material record carries flat
 * `materialDomainId`/`materialDomainName`/`baseUnitId`/`baseUnitSymbol`
 * instead — so do not reintroduce it into these contracts.
 */
export interface NamedReference {
  readonly id: string
  readonly displayName: string
}

/**
 * THE ONE VERSIONED AGGREGATE IN THIS MODULE — and the field is
 * `catalogVersion`, NOT `rowVersion`.
 *
 * Materials bind `expectedCatalogVersion` (required, `> 0`) on UPDATE. The
 * frontend used to send `rowVersion`, which no material record carries, and
 * every material update failed with 400 `REQUEST_VALIDATION_FAILED` — a live
 * production bug this contract retires. `catalogVersion` starts at 1 and
 * increments ONLY when `materialKind` or `trackingType` change; descriptive
 * edits leave it alone. A stale echo is refused with 409
 * `MATERIALS_CATALOG_VERSION_MISMATCH`
 * (`details = { material_id, expected_catalog_version,
 * current_catalog_version }`). Related 409s the UI must expect:
 * `MATERIALS_CLASSIFICATION_LOCKED` (kind/tracking changed after operational
 * use) and `MATERIALS_ARCHIVED_IS_TERMINAL` (Archived is terminal).
 *
 * NO other catalog entity has any version. Do NOT add `expectedRowVersion` /
 * `rowVersion` to domain / category / family / unit / conversion — the columns
 * do not exist, the records do not bind them, and a single "upsert" shape
 * carrying `rowVersion` everywhere is what broke every material save.
 *
 * `requiresAssetNumber` is SERVER-DERIVED (`MaterialResponse` comment +
 * create record omits it): readable, never sendable.
 *
 * `attributes` is a JSON OBJECT STRING or `null` — the backend stores it as
 * text and an array or primitive is a validation failure, so a form must
 * `JSON.stringify` a record, not hand over a stringified list.
 *
 * `materialDomainId`/`materialDomainName` are DERIVED via
 * FamilyId → Category → MaterialDomain (there is no direct FK), and
 * `baseUnitId`/`baseUnitSymbol` are the material's own base unit. Both pairs
 * are read-only here: `familyId` and `baseUnitId` are create-only and are
 * deliberately absent from {@link UpdateMaterialRequest}.
 */
export interface Material {
  readonly id: Uuid
  readonly familyId: Uuid
  readonly nameAr: string
  readonly nameEn: string | null
  readonly code: string
  readonly materialKind: MaterialKind
  readonly trackingType: TrackingType
  readonly hasExpiry: boolean
  readonly requiresAssetNumber: boolean
  readonly catalogVersion: number
  readonly attributes: string | null
  readonly status: MaterialStatus
  readonly materialDomainId: Uuid
  readonly materialDomainName: string
  readonly baseUnitId: Uuid
  readonly baseUnitSymbol: string
}
