import type { CounterpartResolution } from '@/modules/organization/types/counterpart-lookup.types'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type CounterpartLoader = EntityLoader<CounterpartResolution>

/**
 * Compose the AsyncSelect option label from the wire fields.
 *
 * `secondaryLabelAr` is the operation-specific hint the backend attaches —
 * job title for an Employee, location for a Site, etc. — and surfaces as a
 * subtitle so the user can distinguish two same-named counterparts
 * (e.g. two Sites named "المستودع الرئيسي" in different governorates).
 */
function counterpartLabel(counterpart: CounterpartResolution): string {
  return counterpart.secondaryLabelAr
    ? `${counterpart.displayName} — ${counterpart.secondaryLabelAr}`
    : counterpart.displayName
}

/**
 * Contract-backed counterpart option mapping. Search responses are active by
 * contract, while the status guard prevents an unexpected stale option from
 * becoming a new write choice.
 */
export const counterpartSelectorAdapter: EntitySelectorAdapter<CounterpartResolution> =
  createEntitySelectorAdapter<CounterpartResolution>({
    toOption: (counterpart) => ({
      value: counterpart.id,
      label: counterpartLabel(counterpart),
      disabled: counterpart.status !== 'Active',
      payload: counterpart,
    }),
  })

export function useCounterpartSelector(
  loadCounterparts: CounterpartLoader,
): EntitySelectorResult<CounterpartResolution> {
  const loadOptions = useScopedEntityOptions(counterpartSelectorAdapter, loadCounterparts)
  return { options: counterpartSelectorAdapter, loadOptions }
}
