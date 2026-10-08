import type { ComponentPropsWithoutRef } from 'react'

import { useActiveCounterpartOptions } from '@/modules/organization/hooks/use-counterpart-lookups'
import {
  AsyncSelect,
  type AsyncSelectProps,
  type AsyncSelectOption,
} from '@/shared/ui/async-select'
import type { IssueRecipientType } from '@/modules/issue/schemas/issue-info.schema'
import type {
  CounterpartOperation,
  CounterpartReference,
  CounterpartResolution,
  CounterpartType,
} from '@/modules/organization/types/counterpart-lookup.types'

/**
 * Map the contract `CounterpartType` quartet to the wire's `CounterpartType`.
 * The contract names match the wire names for these four kinds:
 * Employee | OrganizationalUnit | Site | External. The Issue petal uses
 * a separate vocabulary in `issue-info.schema.ts` so the schema can be
 * tighter than the backend wire.
 */
function issueRecipientTypeToCounterpartType(recipientType: IssueRecipientType): CounterpartType {
  switch (recipientType) {
    case 'Employee':
      return 'Employee'
    case 'OrganizationalUnit':
      return 'OrganizationalUnit'
    case 'Site':
      return 'Site'
    case 'External':
      return 'External'
  }
}

export interface CounterpartSelectProps {
  value?: string | null
  /**
   * Polarity is the only scope-aware option on this component.
   *
   * `type` is the contract recipient kind (Employee/OrganizationalUnit/Site/
   * External). The wire validator restricts `type` against `operation`, so
   * the caller must pass one that the chosen `operation` accepts:
   *   - Receiving → External only
   *   - Issue     → Employee/OrganizationalUnit/Site
   *   - Transfer  → any of the four (caller picks)
   *   - Return    → any of the four (caller picks)
   *
   * `operation` defaults to `Issue` because that is the only consumer in v1
   * (the Issue petal and the assign-custody dialog).
   */
  type?: string
  operation?: CounterpartOperation
  onValueChange: (
    reference: CounterpartReference | null,
    option: CounterpartResolution | undefined,
  ) => void
  name?: string
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  /** Issue-petal-only convenience that maps to `type` via the schema vocabulary. */
  recipientType?: IssueRecipientType
  inputProps?: ComponentPropsWithoutRef<'input'>
}

/**
 * Polarity + recipient-type options for `useActiveCounterpartOptions`.
 *
 * `operation` is required at the service level; if the caller omits it we
 * fall back to `Issue` (the v1 default). `type` flows from `recipientType`
 * when the caller is an Issue petal, otherwise from `type` directly.
 */
function pickSearchOptions(
  operation: CounterpartOperation | undefined,
  recipientType: IssueRecipientType | undefined,
  type: string | undefined,
): { operation: CounterpartOperation; type?: CounterpartType } {
  const resolvedOperation: CounterpartOperation = operation ?? 'Issue'
  if (recipientType !== undefined) {
    return {
      operation: resolvedOperation,
      type: issueRecipientTypeToCounterpartType(recipientType),
    }
  }
  if (type !== undefined) {
    return { operation: resolvedOperation, type: type as CounterpartType }
  }
  return { operation: resolvedOperation }
}

export function CounterpartSelect(props: CounterpartSelectProps) {
  const options = pickSearchOptions(props.operation, props.recipientType, props.type)
  const { loadOptions } = useActiveCounterpartOptions(options)

  const asyncSelectProps = {
    value: props.value,
    onValueChange: (
      value: string | null,
      option: AsyncSelectOption<CounterpartResolution> | undefined,
    ) => {
      const reference: CounterpartReference | null =
        value !== null && option !== undefined && option.payload !== undefined
          ? { type: option.payload.type, id: option.payload.id }
          : null
      props.onValueChange(reference, option?.payload)
    },
    loadOptions,
    placeholder: props.placeholder ?? 'اختر جهة',
    disabled: props.disabled,
    readOnly: props.readOnly,
    inputProps: props.inputProps,
  } as AsyncSelectProps<CounterpartResolution>

  return <AsyncSelect<CounterpartResolution> {...asyncSelectProps} />
}
