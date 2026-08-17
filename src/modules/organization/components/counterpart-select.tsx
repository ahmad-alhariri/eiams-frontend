import type { CounterpartOption } from '@/shared/types/generated/eiams-v1'

import { useActiveCounterpartOptions } from '@/modules/organization/hooks/use-counterpart-lookups'
import type {
  CounterpartReference,
  CounterpartSearchOptions,
} from '@/modules/organization/types/counterpart-lookup.types'
import { AsyncSelect } from '@/shared/ui/async-select'

export interface CounterpartSelectProps extends CounterpartSearchOptions {
  value?: string | null
  onValueChange: (
    reference: CounterpartReference | null,
    counterpart: CounterpartOption | undefined,
  ) => void
  disabled?: boolean
  readOnly?: boolean
}

/**
 * Active-only, scope-aware selector for recipient and holder form fields.
 * It deliberately has no create action: ExternalParty administration belongs
 * to the dedicated Organization reference-data flow.
 */
export function CounterpartSelect({
  value,
  onValueChange,
  type,
  siteId,
  disabled = false,
  readOnly = false,
}: CounterpartSelectProps) {
  const counterpartSelector = useActiveCounterpartOptions({
    ...(type === undefined ? {} : { type }),
    ...(siteId === undefined ? {} : { siteId }),
  })

  return (
    <AsyncSelect
      {...(value === undefined ? {} : { value })}
      loadOptions={counterpartSelector.loadOptions}
      onValueChange={(nextValue, option) =>
        onValueChange(
          nextValue === null || option?.payload === undefined
            ? null
            : { type: option.payload.type, id: option.payload.id },
          option?.payload,
        )
      }
      disabled={disabled}
      readOnly={readOnly}
      placeholder="ابحث عن جهة مستلمة أو حائزة..."
      emptyMessage="لا توجد جهات نشطة مطابقة ضمن نطاقك."
      errorMessage="تعذر البحث عن الجهات المتاحة ضمن نطاقك."
    />
  )
}
