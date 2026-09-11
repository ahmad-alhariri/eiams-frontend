import { z } from 'zod'

import type {
  MaterialUnitConversion,
  MaterialUnitConversionUpsertRequest,
} from '@/modules/catalog/types/catalog.types'

/** Material-level conversion factors are sent as numbers per the v1 contract. */
const POSITIVE_NUMBER = z
  .number({ message: 'أدخل عامل تحويل رقميًا.' })
  .positive('يجب أن يكون عامل التحويل أكبر من صفر.')

export const materialUnitConversionSchema = z.object({
  unitId: z.string().uuid('اختر وحدة قياس بديلة صالحة.'),
  conversionFactor: POSITIVE_NUMBER,
  status: z.enum(['Active', 'Inactive']),
})

export type MaterialUnitConversionFormValues = z.infer<typeof materialUnitConversionSchema>

/** Maps dialog values to the exact v1 payload, including optimistic concurrency on edit. */
export function toMaterialUnitConversionRequest(
  values: MaterialUnitConversionFormValues,
  materialId: string,
  conversion: MaterialUnitConversion | null,
): MaterialUnitConversionUpsertRequest {
  return {
    materialId,
    unitId: values.unitId,
    conversionFactor: values.conversionFactor,
    rowVersion: conversion?.rowVersion ?? 0,
    status: values.status,
  }
}
