import { useFormContext } from 'react-hook-form'
import { z } from 'zod'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import {
  ISSUE_RECIPIENT_TYPES,
  ISSUE_RECIPIENT_TYPE_LABELS_AR,
  issueInfoSchema,
  type IssueInfoFormValues,
} from '@/modules/issue/schemas/issue-info.schema'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'

/* eslint-disable react-refresh/only-export-components */

/**
 * The `petal.issueTo.*` RHF group this section reads and writes, plus the
 * sibling `petal.issueToDisplayName` value it owns.
 *
 * `recipientDisplayName` is part of the contract `IssueTo` but the UI never
 * types it: it is captured at selection time (the chosen counterpart option's
 * display name) and kept beside the petal so the page can pass it to
 * `toIssueInfo(values.petal.issueTo, values.petal.issueToDisplayName)` when
 * mapping out. It lives outside {@link issueInfoSchema} because the schema
 * validates contract-shaped capture only; the mock document engine persists
 * `request.issueTo` verbatim, so a draft saved without this captured name
 * would render an empty recipient label after reload.
 *
 * Switching the recipient type clears the previously selected recipient — an
 * id captured for one `CounterpartType` must never survive under another.
 */
export interface IssuePetalContainer {
  petal: {
    issueTo: IssueInfoFormValues
    issueToDisplayName: string
  }
}

/** The petal group of the issue document form (header + lines + petal). */
export const issuePetalFormSchema = z.object({
  petal: z.object({
    issueTo: issueInfoSchema,
    issueToDisplayName: z.string(),
  }),
})

export type IssuePetalFormValues = z.infer<typeof issuePetalFormSchema>

export interface IssueRecipientSectionProps {
  /** Disables every editable control; the controls stay registered. */
  disabled?: boolean
}

interface RecipientTypeSelectorControlProps {
  value: string
  disabled: boolean
  onValueChange: (value: string) => void
}

/**
 * Select control for the recipient type with proper id propagation for a11y.
 * Uses useFormField() to get the FormItem's generated id, ensuring the
 * FormLabel's htmlFor matches the Select's internal input id. The disabled
 * prop is threaded explicitly: jsdom does not emulate <fieldset disabled>
 * descendant propagation, and tests must observe the real rendered state.
 */
function RecipientTypeSelectorControl({
  value,
  disabled,
  onValueChange,
}: RecipientTypeSelectorControlProps) {
  const { formItemId } = useFormField()
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue ?? '')} disabled={disabled}>
      <SelectTrigger id={formItemId} aria-label="نوع الجهة المستلمة">
        <SelectValue placeholder="اختر نوع الجهة...">
          {ISSUE_RECIPIENT_TYPE_LABELS_AR[value as (typeof ISSUE_RECIPIENT_TYPES)[number]] ??
            'اختر نوع الجهة...'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ISSUE_RECIPIENT_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {ISSUE_RECIPIENT_TYPE_LABELS_AR[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * IssueTo petal editor (e16-t03). Registers the polymorphic recipient capture
 * (`recipientType` + `recipientId`) and the issue reason under the page's
 * `petal.issueTo.` name prefix, mirroring `DocumentPetals<Issue>`.
 *
 * RHF contract: reads and writes the page's form context through
 * useFormContext — pages compose the spine group, this petal group (plus its
 * displayName sibling), and the lines group into one wider form.
 */
export function IssueRecipientSection({ disabled = false }: IssueRecipientSectionProps) {
  const form = useFormContext<IssuePetalContainer>()
  // The runtime value is a plain string (schema-narrowed unions only apply
  // after validation), which keeps the empty-state comparison honest.
  const recipientType = String(form.watch('petal.issueTo.recipientType'))

  return (
    <fieldset
      data-slot="issue-recipient-section"
      disabled={disabled}
      className="grid gap-5 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-foreground">الجهة المستلمة</legend>
      <div className="grid gap-5 md:grid-cols-3">
        <FormField
          control={form.control}
          name="petal.issueTo.recipientType"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>نوع الجهة المستلمة</FormLabel>
              <RecipientTypeSelectorControl
                value={field.value}
                disabled={disabled}
                onValueChange={(nextType) => {
                  if (nextType !== field.value) {
                    // A recipient captured for one type is meaningless for the
                    // next; clear both the id and the selection-time name.
                    form.setValue('petal.issueTo.recipientId', '', { shouldValidate: false })
                    form.setValue('petal.issueToDisplayName', '', { shouldValidate: false })
                  }
                  field.onChange(nextType)
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        {recipientType === '' ? null : (
          <FormField
            control={form.control}
            name="petal.issueTo.recipientId"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>الجهة المستلمة</FormLabel>
                <RecipientSelectorControl
                  disabled={disabled}
                  recipientType={recipientType}
                  value={field.value}
                  onValueChange={(reference, option) => {
                    form.setValue('petal.issueTo.recipientId', reference?.id ?? '', {
                      shouldValidate: true,
                    })
                    form.setValue(
                      'petal.issueToDisplayName',
                      option?.displayName ?? '',
                      { shouldValidate: false },
                    )
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="petal.issueTo.issueReason"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>سبب الصرف</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={500}
                  disabled={disabled}
                  placeholder="اذكر سبب الصرف..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </fieldset>
  )
}

interface RecipientSelectorControlProps {
  disabled: boolean
  value: string
  recipientType: string
  onValueChange: (
    reference: { type: (typeof ISSUE_RECIPIENT_TYPES)[number]; id: string } | null,
    option: { displayName: string } | undefined,
  ) => void
}

/**
 * Counterpart selector control wiring the shared FormItem-owned ids onto the
 * organization module's scope-aware selector through its inputProps bridge.
 * Declared below the section body to keep the reading order of the three
 * registered fields obvious; hoisting makes that ordering safe.
 */
function RecipientSelectorControl({
  disabled,
  value,
  recipientType,
  onValueChange,
}: RecipientSelectorControlProps) {
  const { error, formDescriptionId, formItemId, formMessageId, required } = useFormField()
  return (
    <CounterpartSelect
      type={recipientType as (typeof ISSUE_RECIPIENT_TYPES)[number]}
      value={value}
      disabled={disabled}
      inputProps={{
        id: formItemId,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby':
          [formDescriptionId, error ? formMessageId : ''].filter(Boolean).join(' ') || undefined,
      }}
      onValueChange={(reference, option) =>
        onValueChange(
          reference === null
            ? null
            : {
                type: reference.type as (typeof ISSUE_RECIPIENT_TYPES)[number],
                id: reference.id,
              },
          option === undefined ? undefined : { displayName: option.displayName },
        )
      }
    />
  )
}
