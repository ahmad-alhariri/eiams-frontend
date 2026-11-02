import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'

import { normalizeApiError, type FieldError } from '@/shared/services/api-error'

/**
 * Flattens contract FieldError payloads into a field → Arabic message map
 * keyed by `error.field`. Later entries for the same field win.
 */
export function fieldErrorsToMap(
  errors: readonly FieldError[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const error of errors ?? []) {
    map[error.field] = error.messageAr
  }
  return map
}

export interface SetFormServerErrorsOptions {
  /**
   * Known flat field keys to accept. When omitted, a key is accepted only
   * when it is a direct own key of `form.getValues()`.
   */
  schemaKeys?: readonly string[]
}

/**
 * Applies contract FieldError payloads to a React Hook Form instance as
 * inline Arabic messages via `form.setError`. Keys outside the known key
 * set (own keys of the values object, or the optional `schemaKeys`
 * allow-list) are skipped so dynamic server payloads cannot inject unknown
 * fields.
 *
 * A rejected value is stale the moment the user corrects it, so every mapped
 * field is watched for a value change and its server error is cleared as soon
 * as that field's value differs from the value the server rejected. Until
 * then the Arabic message stays on screen; no validation mode is touched, so
 * the client-side rules keep their own timing.
 */
export function setFormServerErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  errors: readonly FieldError[] | null | undefined,
  options?: SetFormServerErrorsOptions,
): void {
  const { schemaKeys } = options ?? {}
  const rejectedValues = new Map<FieldPath<TValues>, unknown>()
  for (const error of errors ?? []) {
    const isKnownKey =
      schemaKeys !== undefined
        ? schemaKeys.includes(error.field)
        : Object.prototype.hasOwnProperty.call(form.getValues(), error.field)
    if (isKnownKey) {
      const field = error.field as FieldPath<TValues>
      form.setError(field, {
        type: 'server',
        message: error.messageAr,
      })
      rejectedValues.set(field, form.getValues(field))
    }
  }
  if (rejectedValues.size === 0) {
    return
  }
  const unsubscribe = form.subscribe({
    formState: { values: true },
    callback: () => {
      for (const [field, rejected] of rejectedValues) {
        if (!Object.is(form.getValues(field), rejected)) {
          rejectedValues.delete(field)
          form.clearErrors(field)
        }
      }
      if (rejectedValues.size === 0) {
        unsubscribe()
      }
    },
  })
}

/**
 * Runs a form submit and maps a rejected write back onto the form fields.
 *
 * Every production dialog needs the same three steps: drop the errors of the
 * previous attempt, run the caller's submit, and turn the contract field
 * errors into inline Arabic messages. Repeating that in each dialog puts the
 * error path in six places, and a dialog that forgets a step keeps a stale
 * message on screen. The key list stays with the caller: it is the dialog's
 * own allow-list, and a dialog that shows a create-only field as a note has no
 * form field to carry that error.
 */
export async function submitWithServerErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  values: TValues,
  onSubmit: (values: TValues) => Promise<void>,
  schemaKeys?: readonly string[],
): Promise<void> {
  form.clearErrors()
  try {
    await onSubmit(values)
  } catch (error: unknown) {
    const apiError = normalizeApiError(error)
    setFormServerErrors(
      form,
      apiError.fieldErrors,
      schemaKeys === undefined ? undefined : { schemaKeys },
    )
  }
}
