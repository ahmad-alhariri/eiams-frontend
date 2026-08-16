import { z } from 'zod'

import type {
  MaterialUnitConversion,
  MaterialUnitConversionCreateRequest,
  MaterialUnitConversionUpdateRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * DECIMAL(18,6) expressed as a JSON string. Keeping the source text intact is
 * essential: JavaScript numbers round valid values near the contract limit.
 */
const POSITIVE_DECIMAL_18_6 = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/
const ZERO_DECIMAL = /^0(?:\.0{1,6})?$/

export const materialUnitConversionSchema = z.object({
  fromUnitId: z.string().uuid('اختر وحدة قياس بديلة صالحة.'),
  factor: z
    .string()
    .regex(
      POSITIVE_DECIMAL_18_6,
      'أدخل عاملًا موجبًا بصيغة عشرية صحيحة، وبحد أقصى 12 رقمًا صحيحًا و6 منازل عشرية.',
    )
    .refine((value) => !ZERO_DECIMAL.test(value), 'يجب أن يكون عامل التحويل أكبر من صفر.'),
  status: z.enum(['Active', 'Inactive']),
})

export type MaterialUnitConversionFormValues = z.infer<typeof materialUnitConversionSchema>

export function toMaterialUnitConversionCreateRequest(
  values: MaterialUnitConversionFormValues,
): MaterialUnitConversionCreateRequest {
  return {
    fromUnitId: values.fromUnitId,
    factor: values.factor,
  }
}

/** Used conversions preserve their factor forever; archival is the only allowed edit. */
export function toMaterialUnitConversionUpdateRequest(
  values: MaterialUnitConversionFormValues,
  conversion: MaterialUnitConversion,
): MaterialUnitConversionUpdateRequest {
  return {
    factor: conversion.usedInPostedDocuments ? conversion.factor : values.factor,
    rowVersion: conversion.rowVersion,
    status: values.status,
  }
}
