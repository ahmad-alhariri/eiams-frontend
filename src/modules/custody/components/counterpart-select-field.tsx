import { Controller } from 'react-hook-form'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import type { AssignCustodyFormValues } from '@/modules/custody/schemas/assign-custody.schema'
import type { CounterpartReference } from '@/modules/organization/types/counterpart-lookup.types'

interface CounterpartSelectFieldProps {
  control: import('react-hook-form').Control<AssignCustodyFormValues>
  disabled: boolean
}

/** RHF bridge for the shared Employee counterpart lookup. */
export function CounterpartSelectField({ control, disabled }: CounterpartSelectFieldProps) {
  return (
    <Controller
      control={control}
      name="holderId"
      render={({ field: holderIdField }) => (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-foreground">الموظف المكلف</span>
          <Controller
            control={control}
            name="holderDisplayName"
            render={({ field: nameField }) => (
              <CounterpartSelect
                value={holderIdField.value === '' ? null : holderIdField.value}
                onValueChange={(reference: CounterpartReference | null, counterpart) => {
                  holderIdField.onChange(reference === null ? '' : reference.id)
                  nameField.onChange(reference === null ? '' : (counterpart?.nameAr ?? ''))
                }}
                disabled={disabled}
              />
            )}
          />
        </div>
      )}
    />
  )
}
