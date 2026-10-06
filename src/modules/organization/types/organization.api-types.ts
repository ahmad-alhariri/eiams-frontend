/**
 * Organization module API types — handwritten contracts for direct backend integration.
 *
 * These mirror the backend's actual JSON serialization, verified twice:
 *  1. against the C# response DTOs and `RequestBody` records, and
 *  2. against the running API (2026-10-05), e.g. `GET /sites` returns
 *     `{"id","organizationId","name","code","location","governorateCode","status"}`.
 *
 * Do NOT "tidy" these back toward the frozen generated types in
 * `@/shared/types/generated/eiams-v1`. That file was fictional for three of the
 * four aggregates below: it named the identifier `siteId`/`orgUnitId`/
 * `employeeId` (the wire says `id`), the label `nameAr` (the wire says `name`),
 * declared a `rowVersion` on Site/OrgUnit/Employee that the backend never
 * serves, and nested `site`/`orgUnit` reference objects that are flat
 * `siteId`/`orgUnitId` fields. See txq4.
 *
 * `ExternalParty` is the exception: its projection genuinely serves `NameAr`
 * and `RowVersion`, which is why the header of this file could once claim
 * verification and be true four lines up and false three lines down.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Matches backend RecordStatus enum: "Active" | "Inactive" */
export type RecordStatus = 'Active' | 'Inactive'

/** Matches backend NamedReference: { id: Uuid, displayName: string } */
export interface NamedReference {
  readonly id: string
  readonly displayName: string
}

/** Matches backend Uuid: string (GUID) */
export type Uuid = string

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PageMeta {
  readonly page: number
  readonly pageIndex: number
  readonly pageSize: number
  readonly itemCount: number
  readonly totalItems: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
  readonly hasPreviousPage: boolean
}

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
 *  versioned aggregate and its update command takes no ExpectedRowVersion. */
export interface SiteUpdateRequest {
  readonly name: string
  readonly location?: string | null
  readonly governorateCode?: string | null
}

export interface SitePage {
  readonly items: ReadonlyArray<Site>
  readonly meta: PageMeta
}

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
 *  re-parenting and re-siting are not exposed by the API. Not versioned. */
export interface OrganizationalUnitUpdateRequest {
  readonly name: string
  readonly unitType: string
}

export interface OrganizationalUnitPage {
  readonly items: ReadonlyArray<OrganizationalUnit>
  readonly meta: PageMeta
}

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

/** `PUT /employees/{id}` accepts neither `orgUnitId` nor `employeeNumber`. */
export interface EmployeeUpdateRequest {
  readonly fullName: string
  readonly jobTitle?: string | null
}

export interface EmployeePage {
  readonly items: ReadonlyArray<Employee>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// External Parties
// ---------------------------------------------------------------------------

export interface ExternalParty {
  readonly externalPartyId: Uuid
  readonly nameAr: string
  readonly code?: string | null
  readonly contactInfo?: string | null
  readonly notes?: string | null
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface ExternalPartyUpsertRequest {
  readonly nameAr: string
  readonly code?: string | null
  readonly contactInfo?: string | null
  readonly notes?: string | null
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface ExternalPartyPage {
  readonly items: ReadonlyArray<ExternalParty>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export interface ListSitesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: RecordStatus
}

export interface ListOrganizationalUnitsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly siteId?: string
  readonly status?: RecordStatus
}

export interface ListEmployeesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly orgUnitId?: string
  readonly siteId?: string
  readonly status?: RecordStatus
}

export interface ListExternalPartiesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: RecordStatus
}