/**
 * Organization module API types — handwritten contracts for direct backend integration.
 *
 * These mirror the backend's actual JSON serialization. The aggregate shapes were
 * verified against the running API (2026-10-05), e.g. `GET /sites` returns
 * `{"id","organizationId","name","code","location","governorateCode","status"}`;
 * the write bodies and the status commands were field-for-field re-audited
 * against the C# response DTOs and `RequestBody` records (bead
 * `eiams-frontend-whhu.14`, slice S1).
 *
 * Do NOT "tidy" these back toward the frozen generated types in
 * `@/shared/types/generated/eiams-v1`. That file was fictional for these
 * aggregates: it named the identifier `siteId`/`orgUnitId`/`employeeId` (the wire
 * says `id`), the label `nameAr` (the wire says `name`), declared a `rowVersion`
 * on Site/OrgUnit/Employee that the backend never serves, and nested
 * `site`/`orgUnit` reference objects that are flat `siteId`/`orgUnitId` fields.
 * See txq4.
 *
 * Three wire facts below are load-bearing. Each one has already produced a
 * silent runtime failure that the type system could not catch, which is why they
 * are stated here rather than left to the reader to rediscover:
 *
 *  1. `ExternalParty.id` — NOT `externalPartyId`. See the External Parties
 *     section.
 *  2. Status READS are strings; status WRITES are integers. See
 *     {@link RecordStatus} and {@link RecordStatusCommandValue}.
 *  3. `expectedRowVersion` exists on ExternalParty and NOWHERE ELSE in this
 *     module. See the External Parties section.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Status as the backend SERVES it: every response projection and every query
 * filter serialises the domain `RecordStatus` enum by NAME (`"Active"` /
 * `"Inactive"`).
 *
 * Never use this type for a `Set*Status` command body — see
 * {@link RecordStatusCommandValue}. The read/write split is not an inconsistency
 * to be smoothed over; it is the whole reason there are two types.
 */
export type RecordStatus = 'Active' | 'Inactive'

/**
 * Status as the backend ACCEPTS it in a `Set*Status` command body.
 *
 * Every such controller is `record RequestBody([JsonRequired] int Status)`, so
 * the wire value is the enum ORDINAL, not its name:
 *
 * ```text
 *   domain RecordStatus   |   wire `status`
 *  ---------------------- + ---------------
 *   Active               |   0
 *   Inactive             |   1
 * ```
 *
 * `{"status":"Active"}` is a JSON binding failure (400): ASP.NET cannot convert
 * a JSON string into `int`, and `[JsonRequired]` means an omitted `status` fails
 * the same way. So do not "helpfully" reuse a `status` field read off a record
 * as a command body — the shapes are incompatible on purpose.
 */
export type RecordStatusCommandValue = 0 | 1

/**
 * `RecordStatus` → the integer a `Set*Status` command body requires.
 *
 * Build command bodies through this map (`statusCommandValue(target)`) rather
 * than writing bare `0`/`1` at each call site: the ordinals are only meaningful
 * next to the table on {@link RecordStatusCommandValue}, and a naked `0` at a
 * call site is indistinguishable from a falsy guard to the next reader.
 */
export const statusCommandValue: Readonly<Record<RecordStatus, RecordStatusCommandValue>> = {
  Active: 0,
  Inactive: 1,
}

/** Matches backend NamedReference: { id: Uuid, displayName: string } */
export interface NamedReference {
  readonly id: string
  readonly displayName: string
}

/** Matches backend Uuid: string (GUID) */
export type Uuid = string

/**
 * Every create in this module answers `{ id }` and nothing else: a `Result<Guid>`
 * handler returns the new identifier, never the created record. Declaring a
 * create as `Promise<Organization>` / `Promise<ExternalParty>` hands the caller a
 * phantom record the server never sent.
 *
 * Imported (NOT redeclared) from the shared transport contract so the shape has
 * exactly one declaration, and re-exported here because this file is the module's
 * public type surface — slices that build on it should not have to know that the
 * envelope types live one directory over.
 */
export type { ResourceIdResponse } from '@/shared/api/api-contracts'

import type { ApiPage } from '@/shared/api/api-contracts'

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Every list result in this module IS the shared `ApiPage<T>` — there is no
 * module-local page wrapper and no module-local `PageMeta`; see {@link SitePage}
 * for the reasoning. `ApiPage<T>` (`shared/api/api-contracts.ts`) is already
 * documented as one-based and already normalized from the wire's snake_case
 * block.
 */

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

/** Root of the reference hierarchy: Site → OrganizationalUnit → Employee hang
 *  off an Organization. Flat — there is no nested parent reference. */
export interface Organization {
  readonly id: Uuid
  readonly name: string
  readonly code: string
  readonly status: RecordStatus
}

/** `POST /organizations` body. */
export interface CreateOrganizationRequest {
  readonly name: string
  readonly code: string
}

/** `PUT /organizations/{id}` body — `name` only.
 *
 *  No `code`: the update route does not bind it, so a code rename is not
 *  expressible through this API. Send it on create only.
 *  No `expectedRowVersion` — Organization is NOT a versioned aggregate. */
export interface UpdateOrganizationRequest {
  readonly name: string
}

/** `PUT /organizations/{id}/status` body. Integer status, nothing else — see
 *  {@link RecordStatusCommandValue}. */
export interface SetOrganizationStatusRequest {
  readonly status: RecordStatusCommandValue
}

export type OrganizationPage = ApiPage<Organization>

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export interface Site {
  readonly id: Uuid
  readonly organizationId: Uuid
  readonly name: string
  readonly code: string
  readonly location?: string | null
  readonly governorateCode?: string | null
  readonly status: RecordStatus
}

/** `POST /sites` body. `code` and `organizationId` are create-only: the update
 *  route accepts neither, which is why create and update are separate types
 *  rather than one "upsert". */
export interface SiteCreateRequest {
  readonly organizationId: Uuid
  readonly name: string
  readonly code: string
  readonly location?: string | null
  readonly governorateCode?: string | null
}

/** `PUT /sites/{siteId}` body. Note the absent `rowVersion` — Site is NOT a
 *  versioned aggregate and its update command takes no ExpectedRowVersion.
 *  Do NOT "harmonise" this with `UpdateExternalPartyRequest` by adding
 *  `expectedRowVersion`: the column does not exist, the DTO does not bind it,
 *  and the OpenAPI request body is `additionalProperties: false`, so adding it
 *  turns a valid save into a 400. */
export interface SiteUpdateRequest {
  readonly name: string
  readonly location?: string | null
  readonly governorateCode?: string | null
}

/** `PUT /sites/{siteId}/status` body — see {@link RecordStatusCommandValue}. */
export interface SetSiteStatusRequest {
  readonly status: RecordStatusCommandValue
}

/**
 * `GET /sites` result: the shared page, verbatim.
 *
 * The nine-field `{ items, meta: PageMeta }` wrapper this used to declare
 * carried two fields that lied about their own values: `meta.pageIndex` held
 * the ONE-based wire `page` under a zero-based-sounding name, and `itemCount`,
 * `totalCount` and `totalItems` all pointed at the same number. Nothing read
 * them — every consumer read `meta.totalItems` and `meta.totalPages` — so the
 * inflation cost the truth and bought nothing. `ApiPage<T>` says the same seven
 * facts with names that match the values.
 */
export type SitePage = ApiPage<Site>

// ---------------------------------------------------------------------------
// Organizational Units
// ---------------------------------------------------------------------------

/** `unitType` is a free-form string on the wire (backend `string`, not an enum);
 *  observed live as "Department". Deliberately not narrowed to a union. */
export interface OrganizationalUnit {
  readonly id: Uuid
  readonly siteId: Uuid
  readonly parentId?: Uuid | null
  readonly name: string
  readonly unitType: string
  readonly status: RecordStatus
}

export interface OrganizationalUnitCreateRequest {
  readonly siteId: Uuid
  readonly parentId?: Uuid | null
  readonly name: string
  readonly unitType: string
}

/** `PUT /organizational-units/{id}` accepts neither `siteId` nor `parentId`:
 *  re-parenting and re-siting are not exposed by the API. Not versioned — so no
 *  `expectedRowVersion` either (see `SiteUpdateRequest`). */
export interface OrganizationalUnitUpdateRequest {
  readonly name: string
  readonly unitType: string
}

/** `PUT /organizational-units/{id}/status` body — see {@link RecordStatusCommandValue}. */
export interface SetOrganizationalUnitStatusRequest {
  readonly status: RecordStatusCommandValue
}

export type OrganizationalUnitPage = ApiPage<OrganizationalUnit>

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

/** No `site` and no nested `orgUnit`: the projection carries a flat `orgUnitId`
 *  only, so a site label cannot be derived from an employee record. */
export interface Employee {
  readonly id: Uuid
  readonly orgUnitId: Uuid
  readonly fullName: string
  readonly employeeNumber: string
  readonly jobTitle?: string | null
  readonly status: RecordStatus
}

export interface EmployeeCreateRequest {
  readonly orgUnitId: Uuid
  readonly fullName: string
  readonly employeeNumber: string
  readonly jobTitle?: string | null
}

/** `PUT /employees/{id}` accepts neither `orgUnitId` nor `employeeNumber`:
 *  the employee number is permanently immutable, and a transfer is a different
 *  operation, not an edit. Not versioned — no `expectedRowVersion`. */
export interface EmployeeUpdateRequest {
  readonly fullName: string
  readonly jobTitle?: string | null
}

/** `PUT /employees/{id}/status` body — see {@link RecordStatusCommandValue}. */
export interface SetEmployeeStatusRequest {
  readonly status: RecordStatusCommandValue
}

export type EmployeePage = ApiPage<Employee>

// ---------------------------------------------------------------------------
// External Parties
// ---------------------------------------------------------------------------

/**
 * The ONE versioned aggregate in this module, and the only one whose update is
 * guarded by `expectedRowVersion`.
 *
 * `id`, NOT `externalPartyId`: the projection serialises its identifier as `id`,
 * exactly like every other aggregate here. The previous handwritten declaration
 * used `externalPartyId` — a name copied from the frozen generated snapshot — so
 * every external-party identifier read back as `undefined` while the module
 * type-checked and its tests passed, because the MSW fixture had been minted
 * from the same wrong declaration. `externalPartyId` survives ONLY as a route
 * path placeholder and as a service parameter name; it is not a record field.
 *
 * `createdAtUtc` / `updatedAtUtc` are ISO-8601 UTC strings. Unlike the three
 * optional text fields they are always present, which is why they are required
 * here — a fixture that drops them is a fixture that has stopped matching the
 * wire.
 */
export interface ExternalParty {
  readonly id: Uuid
  readonly nameAr: string
  readonly code?: string | null
  readonly contactInfo?: string | null
  readonly notes?: string | null
  readonly status: RecordStatus
  readonly rowVersion: number
  readonly createdAtUtc: string
  readonly updatedAtUtc: string
}

/**
 * `POST /external-parties` body.
 *
 * No `status`: a new party is Active by definition, and status is a separate
 * guarded command — folding it into create is what let the retired
 * `ExternalPartyUpsertRequest` send a status string the binder rejects.
 * No `rowVersion`: there is no prior version to check.
 */
export interface CreateExternalPartyRequest {
  readonly nameAr: string
  readonly code?: string | null
  readonly contactInfo?: string | null
  readonly notes?: string | null
}

/**
 * `PUT /external-parties/{id}` body.
 *
 * `expectedRowVersion` is REQUIRED and is the `rowVersion` the read served,
 * verbatim — the validator rejects `<= 0` and a freshly created row carries 1,
 * so do not "normalise" it to a 0-based count. A stale value is refused with a
 * conflict rather than silently overwriting a concurrent edit.
 *
 * `status` is deliberately absent even though this aggregate is versioned:
 * activation/deactivation is its own command ({@link SetExternalPartyStatusRequest}),
 * which carries the version guard too. Sending `status` here is rejected by the
 * `additionalProperties: false` request body.
 */
export interface UpdateExternalPartyRequest {
  readonly nameAr: string
  readonly code?: string | null
  readonly contactInfo?: string | null
  readonly notes?: string | null
  readonly expectedRowVersion: number
}

/**
 * `PUT /external-parties/{id}/status` body — the only status command in this
 * module that also carries the concurrency guard, precisely because
 * ExternalParty is the only versioned aggregate. Sending `expectedRowVersion` to
 * `SetSiteStatusRequest` and friends is not a harmless extra field: those request
 * bodies are `additionalProperties: false`.
 */
export interface SetExternalPartyStatusRequest {
  readonly status: RecordStatusCommandValue
  readonly expectedRowVersion: number
}

export type ExternalPartyPage = ApiPage<ExternalParty>

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

/**
 * `page` in every `List*Query` below is the WIRE page and it is ONE-based,
 * exactly as the table controls that produce it are: `useServerPagination`
 * starts at 1 and `DataTableServer` counts from 1, so a page number crosses
 * this boundary unchanged. There is deliberately no `- 1` at any call site and
 * no `pageIndex` alias — the arithmetic that produced `page=0` (400
 * `REQUEST_VALIDATION_FAILED`, `details.Page = ["The field Page must be between
 * 1 and 21474836."]`) had no base to stand on.
 *
 * `pageSize` is bounded by the backend at `[1, 100]`. The service clamps it
 * through `toWireOneBasedPaginationParams`, so a caller cannot ask for 200; a
 * reference list that would need more than 100 rows must therefore SAY SO in
 * the UI rather than silently render a truncated directory.
 */

/** `GET /organizations` filters.
 *
 *  No `search` and no sort parameters: the backend hard-codes ordering by name
 *  and exposes no free-text filter on this collection. Offering them here would
 *  advertise controls the API silently ignores. */
export interface ListOrganizationsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly status?: RecordStatus
}

/** `GET /sites` filters: `organizationId?`, `status?`.
 *
 *  `status` filters are STRING values even though `Set*Status` bodies are
 *  integers — query binding and body binding are separate paths.
 *
 *  `search` is NOT one of them: `GET /sites` binds no free-text filter. It is
 *  still declared because the sites screen offers a search box, and removing
 *  that control (or making it work) is a separate decision from the pagination
 *  contract. Until then it is forwarded and ignored by the server. */
export interface ListSitesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly organizationId?: Uuid
  readonly status?: RecordStatus
}

/** `GET /organizational-units` filters: `siteId?`, `parentId?`, `status?`.
 *
 *  Omitting `parentId` means NO parent filter — it does NOT mean "roots only".
 *  A caller that wants roots has to filter the returned rows itself, which is
 *  what `organizational-unit-tree.model.ts` does.
 *
 *  `search` is NOT bound by this endpoint (see {@link ListSitesQuery}). */
export interface ListOrganizationalUnitsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly siteId?: Uuid
  readonly parentId?: Uuid
  readonly status?: RecordStatus
}

/** `GET /employees` filters: `orgUnitId?`, `status?`.
 *
 *  There is no `siteId`: an employee is reached through its organizational
 *  unit, and `GET /employees` binds no site parameter at all. `siteId` remains
 *  declared for the employee screen's site filter, which the server therefore
 *  ignores (see {@link ListSitesQuery}).
 *
 *  `search` is NOT bound by this endpoint either. */
export interface ListEmployeesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly orgUnitId?: Uuid
  readonly siteId?: Uuid
  readonly status?: RecordStatus
}

/** `GET /external-parties` filters: `search?`, `status?` — the one collection
 *  in this module whose list endpoint really does bind free text. */
export interface ListExternalPartiesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: RecordStatus
}
