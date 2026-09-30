/**
 * Organization module API types — handwritten contracts for direct backend integration.
 *
 * These types match the backend's actual JSON serialization (field names, shapes, enums).
 * They replace the generated imports from `@/shared/types/generated/eiams-v1`.
 *
 * Verified against:
 * - Backend C# response DTOs (SiteResponse, EmployeeResponse, ExternalPartyResponse)
 * - Generated OpenAPI types (eiams-v1.ts components.schemas)
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
  readonly siteId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly status: RecordStatus
  readonly address?: string | null
  readonly governorate?: string | null
  readonly organizationId: Uuid
  readonly rowVersion: number
}

export interface SiteUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly address?: string | null
  readonly governorate?: string | null
  readonly rowVersion: number
  readonly status: RecordStatus
}

export interface SitePage {
  readonly items: ReadonlyArray<Site>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Organizational Units
// ---------------------------------------------------------------------------

export interface OrganizationalUnit {
  readonly orgUnitId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly parentOrgUnitId?: Uuid | null
  readonly siteId: Uuid
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface OrganizationalUnitUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly parentOrgUnitId?: Uuid | null
  readonly siteId: Uuid
  readonly rowVersion: number
  readonly status: RecordStatus
}

export interface OrganizationalUnitPage {
  readonly items: ReadonlyArray<OrganizationalUnit>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface Employee {
  readonly employeeId: Uuid
  readonly employeeNumber: string
  readonly fullNameAr: string
  readonly jobTitleAr?: string | null
  readonly orgUnit: NamedReference
  readonly site: NamedReference
  readonly status: RecordStatus
  readonly rowVersion: number
}

export interface EmployeeUpsertRequest {
  readonly employeeNumber: string
  readonly fullNameAr: string
  readonly jobTitleAr?: string | null
  readonly orgUnitId: Uuid
  readonly rowVersion: number
  readonly status: RecordStatus
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
  readonly rowVersion: number
  readonly status: RecordStatus
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
