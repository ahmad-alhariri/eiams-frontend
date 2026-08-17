import type { CounterpartOption } from '@/shared/types/generated/eiams-v1'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type CounterpartLoader = EntityLoader<CounterpartOption>

function counterpartLabel(counterpart: CounterpartOption): string {
  return counterpart.secondaryLabelAr
    ? `${counterpart.displayName} — ${counterpart.secondaryLabelAr}`
    : counterpart.displayName
}

/**
 * Contract-backed counterpart option mapping. Search responses are active by
 * contract, while the status guard prevents an unexpected stale option from
 * becoming a new write choice.
 */
export const counterpartSelectorAdapter: EntitySelectorAdapter<CounterpartOption> =
  createEntitySelectorAdapter<CounterpartOption>({
    toOption: (counterpart) => ({
      value: counterpart.id,
      label: counterpartLabel(counterpart),
      disabled: counterpart.status !== 'Active',
      payload: counterpart,
    }),
  })

export function useCounterpartSelector(
  loadCounterparts: CounterpartLoader,
): EntitySelectorResult<CounterpartOption> {
  const loadOptions = useScopedEntityOptions(counterpartSelectorAdapter, loadCounterparts)
  return { options: counterpartSelectorAdapter, loadOptions }
}
