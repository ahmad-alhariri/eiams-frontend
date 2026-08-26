import { Controller, type Control } from 'react-hook-form'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import type { AssignCustodyFormValues } from '@/modules/custody/schemas/assign-custody.schema'

interface CounterpartSelectFieldProps {
  control: Control<AssignCustodyFormValues>
  disabled: boolean
}

/** RHF bridge for the shared Employee counterpart lookup. */
export function CounterpartSelectField({ control, disabled }: CounterpartSelectFieldProps) {
  return (
    <Controller
      control={control}
      name="holderId"
      render={({ field: holderIdField, fieldState }) => (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-foreground">الموظف المكلف</span>
          <Controller
            control={control}
            name="holderDisplayName"
            render={({ field: nameField }) => (
              <CounterpartSelect
                type="Employee"
                value={holderIdField.value === '' ? null : holderIdField.value}
                onValueChange={(reference, counterpart) => {
                  holderIdField.onChange(reference === null ? '' : reference.id)
                  nameField.onChange(reference === null ? '' : (counterpart?.displayName ?? ''))
                }}
                inputProps={{ 'aria-label': 'الموظف المكلف' }}
                disabled={disabled}
              />
            )}
          />
          {fieldState.error !== undefined ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  )
}
