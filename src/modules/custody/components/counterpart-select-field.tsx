import { Controller } from 'react-hook-form'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import type { AssignCustodyFormValues } from '@/modules/custody/schemas/assign-custody.schema'
import type {
  CounterpartReference,
  CounterpartResolution,
} from '@/modules/organization/types/counterpart-lookup.types'

interface CounterpartSelectFieldProps {
  control: import('react-hook-form').Control<AssignCustodyFormValues>
  disabled: boolean
}

/**
 * Owns the combobox input's id so the field's `<label>` is bound to the input.
 *
 * A bare `<span>` cannot label anything: `getByLabelText('الموظف المكلف')` finds
 * nothing, the required employee is announced with no accessible name, and the
 * zod message for an unselected holder never reaches the user. The id is a
 * constant rather than a generated one because this field has exactly one
 * instance per dialog.
 *
 * Assign-custody is a personal-custody write (`CustodyKind.Personal`,
 * counterpart is an Employee) — the backend validator only accepts `type:
 * Employee` for the Issue operation when custody-kind is Personal. We pass
 * `operation: 'Issue', type: 'Employee'` explicitly so the wire query
 * matches without forcing the validator to reject every other combination.
 */
const EMPLOYEE_FIELD_ID = 'assign-custody-holder'

/** RHF bridge for the shared Employee counterpart lookup. */
export function CounterpartSelectField({ control, disabled }: CounterpartSelectFieldProps) {
  return (
    <Controller
      control={control}
      name="holderId"
      render={({ field: holderIdField, fieldState: holderIdState }) => (
        <div className="grid gap-2">
          <label htmlFor={EMPLOYEE_FIELD_ID} className="text-sm font-medium text-foreground">
            الموظف المكلف
          </label>
          <Controller
            control={control}
            name="holderDisplayName"
            render={({ field: nameField }) => (
              <CounterpartSelect
                operation="Issue"
                type="Employee"
                value={holderIdField.value === '' ? null : holderIdField.value}
                onValueChange={(
                  reference: CounterpartReference | null,
                  counterpart: CounterpartResolution | undefined,
                ) => {
                  holderIdField.onChange(reference === null ? '' : reference.id)
                  nameField.onChange(reference === null ? '' : (counterpart?.displayName ?? ''))
                }}
                disabled={disabled}
                inputProps={{
                  id: EMPLOYEE_FIELD_ID,
                  'aria-invalid': holderIdState.invalid ? true : undefined,
                  'aria-required': true,
                }}
              />
            )}
          />
          {/* `assignCustodySchema` makes the holder a uuid, so submitting without
              one is the common case and its Arabic message must be visible here
              rather than swallowed by the form. */}
          {holderIdState.error !== undefined ? (
            <p role="alert" className="text-sm text-destructive">
              {holderIdState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  )
}
