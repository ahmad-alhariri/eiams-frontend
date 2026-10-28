import { Controller } from 'react-hook-form'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import type { AssignCustodyFormValues } from '@/modules/custody/schemas/assign-custody.schema'
import type {
  CounterpartOperation,
  CounterpartReference,
  CounterpartResolution,
  CounterpartType,
} from '@/modules/organization/types/counterpart-lookup.types'

interface CounterpartSelectFieldProps {
  control: import('react-hook-form').Control<AssignCustodyFormValues>
  disabled: boolean
  /**
   * The live counterpart operation the picker searches with.
   *
   * The default 'Issue' is the assign-custody lookup: a personal write whose
   * holder is an Employee, and the only pair the backend validator accepts for
   * that operation. The transfer dialog passes 'Transfer', which the live
   * lookup serves for every counterpart kind.
   */
  operation?: CounterpartOperation
  /**
   * The counterpart kind the picker is restricted to.
   *
   * The default 'Employee' keeps the assign-custody holder; the transfer
   * dialog passes the holder kind the operator picked.
   */
  type?: CounterpartType
  /** Arabic label of the picker. The default is the assign-custody wording. */
  label?: string
}

/**
 * Owns the combobox input's id so the field's `<label>` is bound to the input.
 *
 * A bare `<span>` cannot label anything: `getByLabelText('الموظف المكلف')` finds
 * nothing, the required holder is announced with no accessible name, and the
 * zod message for an unselected holder never reaches the user. The id is a
 * constant rather than a generated one because this field has exactly one
 * instance per dialog.
 */
const COUNTERPART_FIELD_ID = 'custody-counterpart-holder'

/** RHF bridge for the shared counterpart lookup. */
export function CounterpartSelectField({
  control,
  disabled,
  operation = 'Issue',
  type = 'Employee',
  label = 'الموظف المكلف',
}: CounterpartSelectFieldProps) {
  return (
    <Controller
      control={control}
      name="holderId"
      render={({ field: holderIdField, fieldState: holderIdState }) => (
        <div className="grid gap-2">
          <label htmlFor={COUNTERPART_FIELD_ID} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <Controller
            control={control}
            name="holderDisplayName"
            render={({ field: nameField }) => (
              <CounterpartSelect
                operation={operation}
                type={type}
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
                  id: COUNTERPART_FIELD_ID,
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
