import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type CounterpartLoader = EntityLoader<ExternalParty>

function counterpartLabel(counterpart: ExternalParty): string {
  return counterpart.code ? `${counterpart.nameAr} — ${counterpart.code}` : counterpart.nameAr
}

/**
 * Contract-backed counterpart option mapping. Search responses are active by
 * contract, while the status guard prevents an unexpected stale option from
 * becoming a new write choice.
 */
export const counterpartSelectorAdapter: EntitySelectorAdapter<ExternalParty> =
  createEntitySelectorAdapter<ExternalParty>({
    toOption: (counterpart) => ({
      value: counterpart.externalPartyId,
      label: counterpartLabel(counterpart),
      disabled: counterpart.status !== 'Active',
      payload: counterpart,
    }),
  })

export function useCounterpartSelector(
  loadCounterparts: CounterpartLoader,
): EntitySelectorResult<ExternalParty> {
  const loadOptions = useScopedEntityOptions(counterpartSelectorAdapter, loadCounterparts)
  return { options: counterpartSelectorAdapter, loadOptions }
}
