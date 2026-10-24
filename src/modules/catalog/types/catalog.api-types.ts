/**
 * Catalog module API types — handwritten contracts for direct backend integration.
 *
 * These mirror the backend's actual JSON serialization. Every route, request
 * body, query filter and projection below was verified against the running API
 * and cross-read against the C# sources behind it (bead
 * `eiams-frontend-whhu.15`, slice S1):
 * `src/Web.Api/Controllers/{MaterialDomains,MaterialCategories,MaterialFamilies,
 * Materials,MaterialUnitConversions,UnitsOfMeasure}/*Controller.cs` and the
 * `*Response` records under `src/Application/<aggregate>/{GetList,GetById}`.
 *
 * Do NOT "tidy" these back toward the frozen generated types in
 * `@/shared/types/generated/eiams-v1`. That file was fictional for this module:
 * it named the identifiers `materialDomainId`/`materialCategoryId`/
 * `materialFamilyId`/`materialUnitConversionId`/`unitId` (the wire says `id`
 * on every one of them), the labels `nameAr` (the wire says `name` on domain,
 * category, family and unit of measure), nested `NamedReference` objects that
 * no catalog projection carries, declared a `rowVersion` on every entity when
 * only Material has any concurrency guard, omitted `TrackingType` entirely,
 * split `MaterialKind` without `Durable`, and typed the conversion `factor` as
 * a string while the wire emits a JSON number.
 *
 * Seven wire facts below are load-bearing. Each one has already produced — or
 * is one typo away from producing — a live failure the type system could not
 * catch, which is why they are stated here rather than left to the reader to
 * rediscover:
 *
 *  1. `/catalog/material-domains`, `/catalog/material-categories` and
 *     `/catalog/material-families` DO NOT EXIST — all three answer 404. The
 *     real collections are `/catalog/domains`, `/catalog/categories` and
 *     `/catalog/families`.
 *  2. Status READS are strings; status WRITES are integer ordinals. See
 *     {@link RecordStatus} / {@link RecordStatusOrdinal} and
 *     {@link MaterialStatus} / {@link MaterialStatusOrdinal}.
 *  3. `expectedCatalogVersion` exists on Material and NOWHERE ELSE — and it is
 *     NOT called `rowVersion`. The frontend used to send `rowVersion` on every
 *     material update, which the backend answers with 400
 *     `REQUEST_VALIDATION_FAILED`. See the Materials section.
 *  4. Every create answers HTTP 200 with `{ id }` (`ResourceIdResponse`),
 *     never 201; every update / status / delete answers 200 with
 *     `"data": null`. Declaring `Promise<Material>` for a create or an update
 *     hands the caller a phantom record the server never sent.
 *  5. `factor` on a unit conversion is a JSON NUMBER, even though the column
 *     is `DECIMAL(18,6)`. See {@link MaterialUnitConversion}.
 *  6. `requiresAssetNumber` is SERVER-DERIVED — readable, never sendable.
 *  7. The materials list is the ONE catalog list that binds `search`; no list
 *     binds a sort parameter, and the units-of-measure list binds no filter at
 *     all — not even `status`.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Status as the backend SERVES it: every catalog projection serialises the
 * domain `Status` enum by NAME (`"Active"` / `"Inactive"`), and every list
 * `status` query filter binds that same name.
 *
 * Never use this type for a `Set*Status` command body — see
 * {@link RecordStatusOrdinal}. The read/write split is not an inconsistency to
 * be smoothed over; it is the whole reason there are two types.
 */
export type RecordStatus = 'Active' | 'Inactive'

/**
 * Status as the backend ACCEPTS it in a `Set*Status` command body for
 * domain / category / family / unit-of-measure.
 *
 * Every such controller is
 * `public sealed record RequestBody([property: JsonRequired] int Status)`
 * casting to the domain enum, so the wire value is the enum ORDINAL, not its
 * name:
 *
 * ```text
 *   domain Status   |   wire `status`
 *  ---------------- + ---------------
 *   Active          |   0
 *   Inactive        |   1
 * ```
 *
 * `{"status":"Inactive"}` is a JSON binding failure (400
 * `REQUEST_VALIDATION_FAILED`) — verified live. So do not "helpfully" reuse the
 * `status` field read off a record as a command body; the shapes are
 * incompatible on purpose.
 */
export type RecordStatusOrdinal = 0 | 1

/**
 * `RecordStatus` → the integer a `Set*Status` command body requires.
 *
 * Build command bodies through this map (`statusCommandValue(target)`) rather
 * than writing bare `0`/`1` at each call site: the ordinals are only meaningful
 * next to the table on {@link RecordStatusOrdinal}, and a naked `0` at a call
 * site is indistinguishable from a falsy guard to the next reader. Same idiom
 * as `organization.api-types.ts` (`statusCommandValue`).
 */
export const statusCommandValue: Readonly<Record<RecordStatus, RecordStatusOrdinal>> = {
  Active: 0,
  Inactive: 1,
}

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
 * Material status as `SetMaterialStatus` ACCEPTS it: the ordinal of
 * `Domain.Materials.MaterialStatus`.
 *
 * ```text
 *   MaterialStatus |   wire `status`
 *  --------------- + ---------------
 *   Active         |   0
 *   Inactive       |   1
 *   Archived       |   2
 * ```
 *
 * `2` exists here and ONLY here — no other catalog entity can be archived,
 * which is why the other five command bodies are
 * {@link RecordStatusOrdinal}.
 */
export type MaterialStatusOrdinal = 0 | 1 | 2

/**
 * `MaterialStatus` → the integer `SetMaterialStatus` requires. The material
 * half of the {@link statusCommandValue} idiom: `Archived` is terminal, so a
 * call site that wants it must name it.
 */
export const materialStatusCommandValue: Readonly<Record<MaterialStatus, MaterialStatusOrdinal>> = {
  Active: 0,
  Inactive: 1,
  Archived: 2,
}

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

/** Matches backend Uuid: string (GUID). */
export type Uuid = string

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
 * Every catalog create answers `{ id }` and nothing else: each controller is
 * `ICommandHandler<..., Guid>` returning `ResourceIdResponse` over HTTP 200
 * (never 201 — verified live). Declaring a create as `Promise<Material>` /
 * `Promise<MaterialDomain>` hands the caller a phantom record the server never
 * sent.
 *
 * Imported (NOT redeclared) from the shared transport contract so the shape
 * has exactly one declaration, and re-exported here because this file is the
 * module's public type surface.
 */
export type { ResourceIdResponse } from '@/shared/api/api-contracts'

import type { ApiPage } from '@/shared/api/api-contracts'

/**
 * Every list result in this module IS the shared `ApiPage<T>` — there is no
 * module-local page wrapper and no module-local `PageMeta`. The old
 * `{ items, meta: PageMeta }` wrapper declared `meta.pageIndex` holding the
 * ONE-based wire `page` under a zero-based-sounding name, plus `itemCount` /
 * `totalCount` fields the wire never emits; the envelope's real snake_case
 * block is `{ page, page_size, total_items, total_pages, has_previous_page,
 * has_next_page, total_count }` and `ApiPage<T>` is already normalized from it
 * (one-based `page` kept). Type-checking against guaranteed field names.
 */
// ---------------------------------------------------------------------------
// Units of Measure
// ---------------------------------------------------------------------------

/**
 * `unitType` is a free-form string on the wire (backend `string`, max 50) —
 * NOT an enum. Observed live with values like "Quantity". Deliberately not
 * narrowed to a union.
 *
 * No `code`, no `nameAr`, no `descriptionAr`, no `nominalConversionFactor`,
 * no `baseUnitId`, no `baseUnit` object: the projection is exactly
 * `{ id, name, symbol, unitType, status }`. The conversion story lives on
 * `MaterialUnitConversion` now.
 */
export interface UnitOfMeasure {
  readonly id: Uuid
  readonly name: string
  readonly symbol: string
  readonly unitType: string
  readonly status: RecordStatus
}

/**
 * `POST /catalog/units-of-measure` body.
 *
 * Create and update carry the SAME three fields today. They are still two
 * types, not one "upsert": the update route binds its own
 * `RequestBody(Name, Symbol, UnitType)` record, and the single-shape era is
 * what let `status` and `rowVersion` ride along into bodies that reject them.
 */
export interface CreateUnitOfMeasureRequest {
  readonly name: string
  readonly symbol: string
  readonly unitType: string
}

/** `PUT /catalog/units-of-measure/{unitId}` body. Not versioned — no
 *  `expectedRowVersion` / `rowVersion`: the column does not exist and the
 *  record does not bind it. Do NOT "harmonise" this with
 *  {@link UpdateMaterialRequest}. */
export interface UpdateUnitOfMeasureRequest {
  readonly name: string
  readonly symbol: string
  readonly unitType: string
}

/** `PUT /catalog/units-of-measure/{unitId}/status` body. Integer status,
 *  nothing else — see {@link RecordStatusOrdinal}. */
export interface SetUnitOfMeasureStatusRequest {
  readonly status: RecordStatusOrdinal
}

export type UnitOfMeasurePage = ApiPage<UnitOfMeasure>

// ---------------------------------------------------------------------------
// Material Domains
// ---------------------------------------------------------------------------

/** `{ id, name, code, status }` — `name`, not `nameAr`. */
export interface MaterialDomain {
  readonly id: Uuid
  readonly name: string
  readonly code: string
  readonly status: RecordStatus
}

/** `POST /catalog/domains` body. No `status`: a new domain is Active by
 *  definition, and status is a separate guarded command. */
export interface CreateMaterialDomainRequest {
  readonly name: string
  readonly code: string
}

/**
 * `PUT /catalog/domains/{materialDomainId}` body — `name` only.
 *
 * No `code`: the update record binds `Name` alone, so a code rename is not
 * expressible through this API. Send it on create only.
 * No version field — MaterialDomain is NOT a versioned aggregate.
 */
export interface UpdateMaterialDomainRequest {
  readonly name: string
}

/** `PUT /catalog/domains/{materialDomainId}/status` body — see
 *  {@link RecordStatusOrdinal}. */
export interface SetMaterialDomainStatusRequest {
  readonly status: RecordStatusOrdinal
}

export type MaterialDomainPage = ApiPage<MaterialDomain>

// ---------------------------------------------------------------------------
// Material Categories
// ---------------------------------------------------------------------------

/**
 * `{ id, materialDomainId, parentCategoryId, name, code, status }`.
 *
 * Flat, like every other catalog projection: no nested `materialDomain` or
 * `parentCategory` `NamedReference`. A domain label for a category therefore
 * cannot be derived from the category itself — callers resolve it from the
 * domain list, which is why `material-category-tree.model.ts` groups by
 * `materialDomainId` and looks names up separately.
 */
export interface MaterialCategory {
  readonly id: Uuid
  readonly materialDomainId: Uuid
  readonly parentCategoryId: Uuid | null
  readonly name: string
  readonly code: string
  readonly status: RecordStatus
}

/** `POST /catalog/categories` body. */
export interface CreateMaterialCategoryRequest {
  readonly materialDomainId: Uuid
  readonly parentCategoryId: Uuid | null
  readonly name: string
  readonly code: string
}

/**
 * `PUT /catalog/categories/{materialCategoryId}` body — `name` and `code`
 * only.
 *
 * `materialDomainId` is NOT updatable: re-domaining is not exposed by this
 * route. `parentCategoryId` is NOT here either — re-parenting has its own
 * command, {@link MoveMaterialCategoryRequest}. Putting the parent on the
 * update body is what the old single "upsert" shape invited, and the update
 * record binds `Name, Code` and nothing else.
 */
export interface UpdateMaterialCategoryRequest {
  readonly name: string
  readonly code: string
}

/**
 * `PUT /catalog/categories/{materialCategoryId}/parent` body — the DEDICATED
 * move route. `null` detaches the category to the domain root.
 *
 * It is deliberately not a field of {@link UpdateMaterialCategoryRequest}:
 * moving a node inside a tree is a graph operation with cycle rules of its
 * own, served by its own controller, and folding it into the descriptive
 * update is how a rename accidentally became a re-parent.
 */
export interface MoveMaterialCategoryRequest {
  readonly parentCategoryId: Uuid | null
}

/** `PUT /catalog/categories/{materialCategoryId}/status` body — see
 *  {@link RecordStatusOrdinal}. */
export interface SetMaterialCategoryStatusRequest {
  readonly status: RecordStatusOrdinal
}

export type MaterialCategoryPage = ApiPage<MaterialCategory>

// ---------------------------------------------------------------------------
// Material Families
// ---------------------------------------------------------------------------

/** `{ id, categoryId, name, code, status }` — `categoryId`, not
 *  `materialCategoryId`, and no nested `parentFamily`/`materialCategory`
 *  reference objects. */
export interface MaterialFamily {
  readonly id: Uuid
  readonly categoryId: Uuid
  readonly name: string
  readonly code: string
  readonly status: RecordStatus
}

/** `POST /catalog/families` body. `categoryId` is create-only. */
export interface CreateMaterialFamilyRequest {
  readonly categoryId: Uuid
  readonly name: string
  readonly code: string
}

/**
 * `PUT /catalog/families/{materialFamilyId}` body — `name` and `code` only.
 * Re-categorising a family is not exposed. Not versioned.
 */
export interface UpdateMaterialFamilyRequest {
  readonly name: string
  readonly code: string
}

/** `PUT /catalog/families/{materialFamilyId}/status` body — see
 *  {@link RecordStatusOrdinal}. */
export interface SetMaterialFamilyStatusRequest {
  readonly status: RecordStatusOrdinal
}

export type MaterialFamilyPage = ApiPage<MaterialFamily>

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

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

/**
 * `POST /catalog/materials` body.
 *
 * `nameEn` and `attributes` are omittable (`string?` in the record); the
 * `[JsonRequired]` members are `familyId`, `baseUnitId`, `materialKind`,
 * `trackingType`, `hasExpiry`. No `status` (Active by definition), no
 * `catalogVersion` (there is no prior classification to check), no
 * `requiresAssetNumber` (server-derived).
 */
export interface CreateMaterialRequest {
  readonly familyId: Uuid
  readonly baseUnitId: Uuid
  readonly nameAr: string
  readonly nameEn?: string | null
  readonly code: string
  readonly materialKind: MaterialKind
  readonly trackingType: TrackingType
  readonly hasExpiry: boolean
  readonly attributes?: string | null
}

/**
 * `PUT /catalog/materials/{materialId}` body.
 *
 * `expectedCatalogVersion` is REQUIRED and is the `catalogVersion` the read
 * served, VERBATIM — echo `material.catalogVersion`; do not invent, decrement
 * or omit it. `familyId` and `baseUnitId` are NOT here: they are not
 * updatable, and sending them is how the old upsert shape tried to move a
 * material between families through a route that binds no such field.
 *
 * Changing `materialKind`/`trackingType` is what bumps the version and what
 * `MATERIALS_CLASSIFICATION_LOCKED` can refuse once the material is in
 * operational use — the edit itself is legal here, the refusal is server-side.
 */
export interface UpdateMaterialRequest {
  readonly nameAr: string
  readonly nameEn?: string | null
  readonly materialKind: MaterialKind
  readonly trackingType: TrackingType
  readonly hasExpiry: boolean
  readonly attributes?: string | null
  readonly expectedCatalogVersion: number
}

/**
 * `PUT /catalog/materials/{materialId}/status` body — the ONLY status command
 * in this module whose ordinal space has three values, because Material is the
 * only entity with `Archived`. See {@link MaterialStatusOrdinal}.
 */
export interface SetMaterialStatusRequest {
  readonly status: MaterialStatusOrdinal
}

export type MaterialPage = ApiPage<Material>

// ---------------------------------------------------------------------------
// Material Unit Conversions
// ---------------------------------------------------------------------------

/**
 * `{ id, materialId, fromUnitId, toBaseUnitId, factor }`.
 *
 * NO `status` field — a conversion is not a suspendable master record; its
 * lifecycle is DELETE, not status change. That is also why
 * {@link MaterialUnitConversionPage} has no status filter and why the service
 * exposes `removeMaterialUnitConversion` and NO
 * `setMaterialUnitConversionStatus`.
 *
 * `factor` is a JSON **NUMBER** on the wire (`"factor":12.000000`), even
 * though the column is `DECIMAL(18,6)`. The shared `api-contracts.ts` design
 * note about `PositiveDecimal18_6` string transport describes the DOCUMENT
 * decimals; this field was verified live as a number, and the frozen
 * generated snapshot's `factor: string` is the fiction. Keep `number` — a
 * string here would fail JSON binding against the `decimal Factor` the
 * controllers declare.
 */
export interface MaterialUnitConversion {
  readonly id: Uuid
  readonly materialId: Uuid
  readonly fromUnitId: Uuid
  readonly toBaseUnitId: Uuid
  readonly factor: number
}

/** `POST /catalog/materials/{materialId}/unit-conversions` body — all three
 *  members `[JsonRequired]`. `toBaseUnitId` is the material's own base unit. */
export interface CreateMaterialUnitConversionRequest {
  readonly fromUnitId: Uuid
  readonly toBaseUnitId: Uuid
  readonly factor: number
}

/**
 * `PUT /catalog/materials/{materialId}/unit-conversions/{conversionId}` body
 * — `factor` ONLY. Correcting a factor does not re-point the units: changing
 * `fromUnitId`/`toBaseUnitId` means remove-and-add, not update. Not versioned.
 */
export interface UpdateMaterialUnitConversionRequest {
  readonly factor: number
}

export type MaterialUnitConversionPage = ApiPage<MaterialUnitConversion>

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

/**
 * `page` in every `List*Query` below is the WIRE page and it is ONE-based,
 * exactly as the table controls that produce it are: `useServerPagination`
 * starts at 1 and `DataTableServer` counts from 1. The service clamps it
 * through `toWireOneBasedPaginationParams`, so `page=0` (400) cannot be
 * expressed by a caller.
 *
 * `pageSize` is bounded by the backend at `[1, 100]` (default 20), clamped the
 * same way.
 *
 * The materials list binds `search` (name/code); no other catalog list does, and
 * no catalog list binds a sort parameter. A call site that sends an unbound
 * filter is consulting this slice's breakage report.
 *
 * `status` filters are STRING enum names even though `Set*Status` bodies are
 * ordinals — query binding and body binding are separate paths.
 */

/** `GET /catalog/units-of-measure` binds NO filter at all — not even
 *  `status`. Only `page`/`pageSize`. */
export interface ListUnitsOfMeasureQuery {
  readonly page?: number
  readonly pageSize?: number
}

/** `GET /catalog/domains` filters: `status?`. */
export interface ListMaterialDomainsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly status?: RecordStatus
}

/**
 * `GET /catalog/categories` filters: `materialDomainId?`, `parentCategoryId?`,
 * `rootOnly?`, `status?`.
 *
 * `rootOnly=true` means `ParentCategoryId IS NULL`; `parentCategoryId` is
 * IGNORED while `rootOnly=true`. With NEITHER, the server returns ALL rows —
 * roots and children mixed — so a tree builder must not treat an unfiltered
 * list as a root list.
 */
export interface ListMaterialCategoriesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly materialDomainId?: Uuid
  readonly parentCategoryId?: Uuid
  readonly rootOnly?: boolean
  readonly status?: RecordStatus
}

/** `GET /catalog/families` filters: `categoryId?`, `status?`. */
export interface ListMaterialFamiliesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly categoryId?: Uuid
  readonly status?: RecordStatus
}

/**
 * `GET /catalog/materials` filters: `search?`, `familyId?`,
 * `materialDomainId?`, `status?` — the material domain filter is
 * `materialDomainId`, not `domainId`/`categoryId`, and `search` matches the
 * material name/code server-side. `status` is {@link MaterialStatus}, so
 * `Archived` is expressible here.
 */
export interface ListMaterialsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly familyId?: Uuid
  readonly materialDomainId?: Uuid
  readonly status?: MaterialStatus
}

/** `GET /catalog/materials/{materialId}/unit-conversions` binds NO filter —
 *  the material comes from the path and nothing else but pagination applies. */
export interface ListMaterialUnitConversionsQuery {
  readonly page?: number
  readonly pageSize?: number
}
