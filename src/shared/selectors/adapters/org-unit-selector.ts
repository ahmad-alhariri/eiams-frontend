import type { OrganizationalUnit } from '@/shared/types/generated/eiams-v1'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type OrgUnitLoader = EntityLoader<OrganizationalUnit>

/**
 * Org unit selector adapter: label = Arabic name, hint = code (carried in the
 * payload), and inactive org units are disabled. Typed against the full
 * `OrganizationalUnit` contract entity — no dedicated OrgUnitReference type exists.
 */
const orgUnitAdapter: EntitySelectorAdapter<OrganizationalUnit> =
  createEntitySelectorAdapter<OrganizationalUnit>({
    toOption: (orgUnit) => ({
      value: orgUnit.orgUnitId,
      label: orgUnit.nameAr,
      disabled: orgUnit.status !== 'Active',
      payload: orgUnit,
    }),
  })

/**
 * Scope-ready org unit selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useOrgUnitSelector(
  loadOrgUnits: OrgUnitLoader,
): EntitySelectorResult<OrganizationalUnit> {
  const loadOptions = useScopedEntityOptions(orgUnitAdapter, loadOrgUnits)
  return { options: orgUnitAdapter, loadOptions }
}
