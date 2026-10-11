import { z } from 'zod'

import type {
  CreateMaterialUnitConversionRequest,
  UpdateMaterialUnitConversionRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * `factor` is a JSON NUMBER on the wire (`"factor":12.000000`), even though the
 * column is `DECIMAL(18,6)`. Keep `number`: a string here would fail JSON
 * binding against the `decimal Factor` the controllers declare.
 */
const POSITIVE_NUMBER = z
  .number({ message: 'أدخل عامل تحويل رقميًا.' })
  .positive('يجب أن يكون عامل التحويل أكبر من صفر.')

/**
 * A conversion carries NO `status`: it is not a suspendable master record and
 * its lifecycle is DELETE, not status change. That is why there is no
 * `setMaterialUnitConversionStatus` and why this schema has no status field.
 */
export const materialUnitConversionSchema = z.object({
  fromUnitId: z.string('اختر وحدة قياس بديلة صالحة.').uuid('اختر وحدة قياس بديلة صالحة.'),
  factor: POSITIVE_NUMBER,
})

export type MaterialUnitConversionFormValues = z.infer<typeof materialUnitConversionSchema>

/**
 * `POST /catalog/materials/{materialId}/unit-conversions` body — all three
 * members `[JsonRequired]`. `toBaseUnitId` is the material's own base unit and
 * is supplied by the caller from the material, never chosen in the form.
 */
export function toCreateMaterialUnitConversionRequest(
  values: MaterialUnitConversionFormValues,
  toBaseUnitId: string,
): CreateMaterialUnitConversionRequest {
  return {
    fromUnitId: values.fromUnitId,
    toBaseUnitId: toBaseUnitId as CreateMaterialUnitConversionRequest['toBaseUnitId'],
    factor: values.factor,
  }
}

/**
 * `PUT .../unit-conversions/{conversionId}` body — `factor` ONLY.
 *
 * Correcting a factor does not re-point the units: changing
 * `fromUnitId`/`toBaseUnitId` means remove-and-add, not update, so those two are
 * dropped here rather than silently ignored by a route that does not bind them.
 * Not versioned, so there is no `existing` parameter to read a token from.
 */
export function toUpdateMaterialUnitConversionRequest(
  values: MaterialUnitConversionFormValues,
): UpdateMaterialUnitConversionRequest {
  return {
    factor: values.factor,
  }
}
