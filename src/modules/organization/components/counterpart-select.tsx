import type { ComponentPropsWithoutRef } from 'react'

import { useActiveCounterpartOptions } from '@/modules/organization/hooks/use-counterpart-lookups'
import {
  AsyncSelect,
  type AsyncSelectProps,
  type AsyncSelectOption,
} from '@/shared/ui/async-select'
import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import type { CounterpartReference } from '@/modules/organization/types/counterpart-lookup.types'
import type { IssueRecipientType } from '@/modules/issue/schemas/issue-info.schema'

export interface CounterpartSelectProps {
  value?: string | null
  onValueChange: (reference: CounterpartReference | null, option: ExternalParty | undefined) => void
  name?: string
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  type?: IssueRecipientType
  inputProps?: ComponentPropsWithoutRef<'input'>
}

export function CounterpartSelect(props: CounterpartSelectProps) {
  const { loadOptions } = useActiveCounterpartOptions()

  const asyncSelectProps = {
    value: props.value,
    onValueChange: (value: string | null, option: AsyncSelectOption<ExternalParty> | undefined) => {
      const reference: CounterpartReference | null =
        value !== null ? { type: 'ExternalParty', id: value } : null
      props.onValueChange(reference, option?.payload)
    },
    loadOptions,
    placeholder: props.placeholder ?? 'اختر جهة خارجية',
    disabled: props.disabled,
    readOnly: props.readOnly,
    inputProps: props.inputProps,
  } as AsyncSelectProps<ExternalParty>

  return <AsyncSelect<ExternalParty> {...asyncSelectProps} />
}
