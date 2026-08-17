import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived server-side filters for organization reference lists. */
export type ListSitesQuery = NonNullable<operations['listSites']['parameters']['query']>
export type ListOrganizationalUnitsQuery = NonNullable<
  operations['listOrganizationalUnits']['parameters']['query']
>
export type ListEmployeesQuery = NonNullable<operations['listEmployees']['parameters']['query']>
export type ListExternalPartiesQuery = NonNullable<
  operations['listExternalParties']['parameters']['query']
>
