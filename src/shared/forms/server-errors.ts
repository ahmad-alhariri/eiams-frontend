import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'

import type { FieldError } from '@/shared/types/generated/eiams-v1'

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
 */
export function setFormServerErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  errors: readonly FieldError[] | null | undefined,
  options?: SetFormServerErrorsOptions,
): void {
  const { schemaKeys } = options ?? {}
  for (const error of errors ?? []) {
    const isKnownKey =
      schemaKeys !== undefined
        ? schemaKeys.includes(error.field)
        : Object.prototype.hasOwnProperty.call(form.getValues(), error.field)
    if (isKnownKey) {
      form.setError(error.field as FieldPath<TValues>, {
        type: 'server',
        message: error.messageAr,
      })
    }
  }
}
